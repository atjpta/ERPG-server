import { callRoom } from "@/core/rooms/room.integration.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { generateEntityId } from "@/core/entities/base.entity.js";
import type { Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import {
    ApplyPlayerChangesGlobalCommand,
    SyncPlayersGlobalCommand,
    type PlayerChangeEntry,
    type PlayerChangeOp,
    type PlayerDataSnapshot,
} from "@/rooms/global/global.shared.js";
import { worldEvents } from "@/rooms/world/utils/world-events.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/** Lô thay đổi đã chốt `eventId` — gửi lại nguyên `eventId` khi lần trước không tới được global. */
interface Batch {
    eventId: string;
    ops: PlayerChangeOp[];
    /** Số lần global trả lỗi tạm thời cho lô này. */
    attempts: number;
}

/** Mã lỗi hạ tầng của global: lô chưa được áp dụng nên gửi lại được. */
const RETRYABLE_CODES = new Set<unknown>([CommonCode.INTERNAL_ERROR, CommonCode.ROOM_UNAVAILABLE]);
/** Quá số lần này thì bỏ lô để một lô lỗi mãi không chặn hàng đợi. */
const MAX_ATTEMPTS = 20;

interface PendingChanges {
    open: PlayerChangeOp[];
    sent: Batch[];
}

/**
 * Cầu nối world ↔ PlayerData của global (xem `PlayerDataState`): world chỉ giữ bản sao chỉ-đọc của túi / trang bị /
 * điểm, mọi thay đổi chúng đi qua global. Thay đổi cần kết quả ngay (quest, thoại, bình thuốc) gọi `apply`; thay đổi
 * dày đặc (item rơi, điểm lên level) gom bằng `queue` rồi `flush` định kỳ. `sync` là backup phần world làm chủ.
 */
export class PlayerDataWorldService {
    private readonly pending = new WeakMap<WorldRoom, Map<string, PendingChanges>>();

    /** Nhận snapshot từ global; túi đổi thì báo (quest "collect" cập nhật tiến độ). */
    applySnapshot(room: WorldRoom, playerId: string, data: PlayerDataSnapshot): void {
        const player = room.state.players.get(playerId);
        if (!player || !player.applyPlayerData(data)) return;
        const client = room.clientOf(playerId);
        if (client) worldEvents.emitInventoryChanged(client, player);
    }

    /** Thay đổi cần kết quả ngay: gửi hàng đợi trước (giữ thứ tự) rồi gửi lô này; thất bại thì không đổi gì. */
    async apply(room: WorldRoom, playerId: string, ops: PlayerChangeOp[]): Promise<Result> {
        await this.flush(room);
        const eventId = generateEntityId();
        const called = await callRoom(room.serverId, ApplyPlayerChangesGlobalCommand, {
            entries: [{ eventId, playerId, ops }],
        });
        if (Response.isError(called)) return called;
        const entry = called.data.find((result) => result.eventId === eventId);
        if (!entry) return Response.error(CommonCode.ROOM_UNAVAILABLE);
        return Response.isError(entry.result) ? entry.result : Response.success();
    }

    /** Ghi nhớ thay đổi để gửi ở lần `flush` kế tiếp (không chờ kết quả). */
    queue(room: WorldRoom, playerId: string, ops: PlayerChangeOp[]): void {
        if (ops.length === 0) return;
        const byPlayer = this.pendingOf(room);
        const changes = byPlayer.get(playerId) ?? { open: [], sent: [] };
        changes.open.push(...ops);
        byPlayer.set(playerId, changes);
    }

    /** Gửi mọi thay đổi đang chờ lên global; lô không tới được giữ lại (cùng `eventId`) cho lần sau. */
    async flush(room: WorldRoom): Promise<void> {
        const byPlayer = this.pendingOf(room);
        const entries: PlayerChangeEntry[] = [];
        for (const [playerId, changes] of byPlayer) {
            if (changes.open.length > 0) {
                changes.sent.push({ eventId: generateEntityId(), ops: changes.open, attempts: 0 });
                changes.open = [];
            }
            for (const batch of changes.sent) entries.push({ ...batch, playerId });
        }
        if (entries.length === 0) return;

        const called = await callRoom(room.serverId, ApplyPlayerChangesGlobalCommand, {
            entries,
        });
        if (Response.isError(called)) {
            console.error(`[WorldRoom] Flush player changes failed: ${called.code}`);
            return;
        }
        for (const { eventId, result } of called.data) {
            const failed = Response.isError(result);
            if (failed) {
                console.error(`[WorldRoom] Player change ${eventId} rejected: ${result.code}`);
            }
            for (const [playerId, changes] of byPlayer) {
                const batch = changes.sent.find((sent) => sent.eventId === eventId);
                if (!batch) continue;
                // Lỗi tạm thời (global không lưu được DB...): giữ lô, gửi lại cùng `eventId` — global chưa ghi nhận
                // nên áp dụng đúng một lần. Lỗi nghiệp vụ hoặc quá số lần thử thì bỏ.
                if (failed && RETRYABLE_CODES.has(result.code) && ++batch.attempts < MAX_ATTEMPTS) {
                    continue;
                }
                changes.sent = changes.sent.filter((sent) => sent.eventId !== eventId);
                if (changes.sent.length === 0 && changes.open.length === 0)
                    byPlayer.delete(playerId);
            }
        }
    }

    /**
     * Backup phần world làm chủ của các player lên global (global lưu DB) rồi nhận lại revision / snapshot mới.
     * Trả danh sách player đã được global lưu.
     */
    async sync(room: WorldRoom, playerIds: readonly string[]): Promise<Set<string>> {
        const saved = new Set<string>();
        await this.flush(room);
        const entries = playerIds.flatMap((playerId) => {
            const player = room.state.players.get(playerId);
            if (!player) return [];
            // Chụp ngay (không đợi await) để không lẫn thay đổi của tick sau.
            return [
                {
                    playerId,
                    baseRevision: player.stateRevision,
                    world: player.toWorldFields(room.map.code),
                },
            ];
        });
        if (entries.length === 0) return saved;

        const called = await callRoom(room.serverId, SyncPlayersGlobalCommand, { entries });
        if (Response.isError(called)) {
            console.error(`[WorldRoom] Sync players to global failed: ${called.code}`);
            return saved;
        }
        for (const result of called.data) {
            if (result.code !== undefined || result.revision === undefined) {
                console.error(`[WorldRoom] Sync player ${result.playerId} failed: ${result.code}`);
                continue;
            }
            saved.add(result.playerId);
            const player = room.state.players.get(result.playerId);
            if (!player) continue;
            if (result.data) this.applySnapshot(room, result.playerId, result.data);
            player.setStateRevision(Math.max(player.stateRevision, result.revision));
        }
        return saved;
    }

    private pendingOf(room: WorldRoom): Map<string, PendingChanges> {
        let byPlayer = this.pending.get(room);
        if (!byPlayer) {
            byPlayer = new Map();
            this.pending.set(room, byPlayer);
        }
        return byPlayer;
    }
}

export const playerDataWorldService = new PlayerDataWorldService();
