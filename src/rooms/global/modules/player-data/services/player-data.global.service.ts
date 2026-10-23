import { generateEntityId } from "@/core/entities/base.entity.js";
import { callRoom } from "@/core/rooms/room.integration.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import type { Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import type { Wallet } from "@/modules/player/schemas/wallet.schema.js";
import type { PlayerSavedState } from "@/modules/player/types/player-fields.type.js";
import { playerService } from "@/modules/player/services/player.service.js";
import type { CurrencyReward } from "@/modules/rewards/types/reward.type.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import { PlayerDataState } from "@/rooms/global/modules/player-data/schemas/player-data.global.state.js";
import { inventoryGlobalService } from "@/rooms/global/modules/inventory/services/inventory.global.service.js";
import type { GrantOutcome } from "@/modules/player/services/inventory.service.js";
import type {
    PlayerChangeEntry,
    PlayerChangeEntryResult,
    PlayerSyncEntry,
    PlayerSyncEntryResult,
    PlayerWorldView,
} from "@/rooms/global/modules/player-data/types/player-data.type.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import {
    CreditWalletWorldCommand,
    DebitWalletWorldCommand,
} from "@/rooms/world/modules/players/commands/wallet.world.command.js";
import { PlayerDataChangedWorldCommand } from "@/rooms/world/modules/players/commands/player-data-changed.world.command.js";
import { PullPlayerFieldsWorldCommand } from "@/rooms/world/modules/players/commands/pull-player-fields.world.command.js";

export interface MutateOptions {
    /** Cần giá trị mới nhất của phần world làm chủ (level, ví...) → kéo từ world trước khi chạy. */
    pullsWorld?: boolean;
    /** Thao tác đổi stats → gửi lại `attributes` cho client. */
    changesStats?: boolean;
    /** Gửi lại `inventory` (mặc định có). */
    sendsInventory?: boolean;
}

/** Số tiền ví giảm đi giữa `before` và `after`; tăng ví không được hỗ trợ (ném lỗi). */
function walletDebit(before: Wallet, after: Wallet): CurrencyReward[] {
    const debit: CurrencyReward[] = [];
    for (const code of Object.values(CurrencyCode)) {
        const diff = (before[code]?.balance ?? 0) - (after[code]?.balance ?? 0);
        if (diff > 0) debit.push({ code, amount: diff });
        else if (diff < 0) throw new Error(`Wallet credit is not supported here (${code})`);
    }
    return debit;
}

/**
 * Vòng đời và đồng bộ PlayerData của global (xem `PlayerDataState`): nạp từ DB, **lưu liền** sau mỗi thay đổi (global
 * là bên ghi DB duy nhất lúc đang chơi), đẩy bản mới sang world và gửi message cho client. Mọi thao tác của cùng một
 * player chạy tuần tự (`exclusive`).
 */
export class PlayerDataGlobalService {
    private readonly queues = new Map<string, Promise<unknown>>();

    /** Chạy `task` sau khi mọi thao tác trước đó của `playerId` xong. */
    exclusive<T>(playerId: string, task: () => Promise<T>): Promise<T> {
        const previous = this.queues.get(playerId) ?? Promise.resolve();
        const run: Promise<T> = previous.then(task, task);
        const tail = run.catch((): undefined => undefined);
        this.queues.set(playerId, tail);
        void tail.then(() => {
            if (this.queues.get(playerId) === tail) this.queues.delete(playerId);
        });
        return run;
    }

    /** PlayerData đang giữ trong room, nạp từ DB nếu chưa có. Gọi trong `exclusive`. */
    async load(room: GlobalRoom, playerId: string): Promise<PlayerDataState> {
        const existing = room.state.players.get(playerId);
        if (existing) return existing;
        const state = PlayerDataState.fromSnapshot(
            await playerService.getPlayableSnapshotOrFail(playerId)
        );
        room.state.players.set(playerId, state);
        return state;
    }

    /**
     * Lấy level / ví hiện tại trực tiếp từ world room đang giữ người chơi; không ở trong world thì đọc từ DB (world
     * lưu lần cuối).
     */
    async fetchWorld(room: GlobalRoom, playerId: string): Promise<PlayerWorldView> {
        const worldRoomId = room.state.players.get(playerId)?.worldRoomId;
        if (worldRoomId) {
            const pulled = await callRoom(worldRoomId, PullPlayerFieldsWorldCommand, { playerId });
            if (!Response.isError(pulled)) return pulled.data;
        }
        const saved = await playerService.getPlayableSnapshotOrFail(playerId);
        return { level: saved.level, wallet: structuredClone(saved.wallet) };
    }

    /**
     * Ghi `player_states` (khoá lạc quan theo `revision`). Mặc định chỉ cột global làm chủ; backup từ world truyền
     * thêm phần world. Lệch revision (ai đó ghi ngoài global) thì bỏ bản đang giữ (lần sau nạp lại từ DB) rồi ném lỗi.
     */
    async save(
        room: GlobalRoom,
        state: PlayerDataState,
        fields: Partial<PlayerSavedState> = state.toGlobalFields()
    ): Promise<void> {
        try {
            const saved = await playerService.saveState(state.playerId, fields, state.revision);
            state.revision = saved.revision;
        } catch (error) {
            console.error(`[PlayerData] Save player ${state.playerId} failed:`, error);
            room.state.players.delete(state.playerId);
            throw error;
        }
    }

    /** Đẩy snapshot mới sang world room đang giữ player (nếu có). */
    pushToWorld(room: GlobalRoom, state: PlayerDataState): void {
        const worldRoomId = room.state.players.get(state.playerId)?.worldRoomId;
        if (!worldRoomId) return;
        void callRoom(worldRoomId, PlayerDataChangedWorldCommand, {
            playerId: state.playerId,
            data: state.toSnapshot(),
        });
    }

    sendInventory(room: GlobalRoom, state: PlayerDataState): void {
        const client = room.clientOf(state.playerId);
        if (client) inventoryGlobalService.send(client, state);
    }

    sendAttributes(room: GlobalRoom, state: PlayerDataState): void {
        room.clientOf(state.playerId)?.sendSuccess(
            GlobalMessage.ATTRIBUTES,
            state.getAttributeSummary()
        );
    }

    /** Gửi túi + thuộc tính hiện tại cho client vừa vào global (hoặc world vừa attach). */
    async sendInitial(room: GlobalRoom, client: PlayerClient): Promise<void> {
        const { playerId } = client.auth;
        await this.exclusive(playerId, async () => {
            const state = await this.load(room, playerId);
            inventoryGlobalService.send(client, state);
            client.sendSuccess(GlobalMessage.ATTRIBUTES, state.getAttributeSummary());
        });
    }

    /**
     * Chạy một thao tác thay đổi PlayerData của `playerId` trên **bản làm việc**: lỗi thì bỏ, thành công thì
     * (trừ ví ở world nếu có) nhận kết quả, lưu liền, đẩy sang world và gửi message cho client.
     */
    mutate<T>(
        room: GlobalRoom,
        playerId: string,
        options: MutateOptions,
        run: (work: PlayerDataState, world: PlayerWorldView) => Result<T>
    ): Promise<Result<T>> {
        return this.exclusive(playerId, async () => {
            const state = await this.load(room, playerId);
            const world = await this.fetchWorld(room, playerId);
            const worldWork = structuredClone(world);

            const work = state.workingCopy();
            const result = run(work, worldWork);
            if (Response.isError(result)) return result;

            const debit = walletDebit(world.wallet, worldWork.wallet);
            const worldRoomId = room.state.players.get(playerId)?.worldRoomId;
            const walletEventId = generateEntityId();
            if (debit.length > 0) {
                if (!worldRoomId) return Response.error(PlayerErrorCode.PLAYER_OFFLINE);
                const debited = await callRoom(worldRoomId, DebitWalletWorldCommand, {
                    eventId: walletEventId,
                    playerId,
                    currencies: debit,
                });
                if (Response.isError(debited)) return debited;
            }

            const before = state.workingCopy();
            state.adopt(work);
            try {
                await this.save(room, state);
            } catch (error) {
                if (debit.length > 0 && worldRoomId) {
                    await callRoom(worldRoomId, CreditWalletWorldCommand, {
                        eventId: `${walletEventId}:undo`,
                        playerId,
                        currencies: debit,
                    });
                }
                state.adopt(before);
                throw error;
            }

            this.pushToWorld(room, state);
            if (options.sendsInventory !== false) this.sendInventory(room, state);
            if (options.changesStats) this.sendAttributes(room, state);
            return result;
        });
    }

    /** Đọc PlayerData (không đổi) — `pullsWorld` để thấy ví / level mới nhất. */
    read<T>(
        room: GlobalRoom,
        playerId: string,
        options: Pick<MutateOptions, "pullsWorld">,
        run: (state: PlayerDataState, world: PlayerWorldView | undefined) => T
    ): Promise<T> {
        return this.exclusive(playerId, async () => {
            const state = await this.load(room, playerId);
            const world = options.pullsWorld ? await this.fetchWorld(room, playerId) : undefined;
            return run(state, world);
        });
    }

    /**
     * Áp dụng các lô thay đổi từ world (item rơi, điểm lên level, vật phẩm của quest / thoại / bình thuốc). Mỗi
     * entry nguyên tử và idempotent theo `eventId`.
     */
    applyEntries(
        room: GlobalRoom,
        entries: PlayerChangeEntry[]
    ): Promise<PlayerChangeEntryResult[]> {
        return Promise.all(entries.map((entry) => this.applyEntry(room, entry)));
    }

    private applyEntry(
        room: GlobalRoom,
        entry: PlayerChangeEntry
    ): Promise<PlayerChangeEntryResult> {
        const { eventId, playerId } = entry;
        return this.exclusive(playerId, async (): Promise<PlayerChangeEntryResult> => {
            try {
                const state = await this.load(room, playerId);
                if (state.hasSeen(eventId)) {
                    return { eventId, result: Response.success({ revision: state.revision }) };
                }
                const work = state.workingCopy();
                const client = room.clientOf(playerId);
                let statsChanged = false;
                const grants: GrantOutcome[] = [];
                for (const op of entry.ops) {
                    if (op.type === "takeItem") {
                        if (!work.takeByCode(op.itemCode, op.quantity)) {
                            return {
                                eventId,
                                result: Response.error(ItemErrorCode.ITEM_NOT_ENOUGH),
                            };
                        }
                    } else if (op.type === "giveItem") {
                        if (op.requireFit && !work.canFit(op.items)) {
                            return {
                                eventId,
                                result: Response.error(ItemErrorCode.INVENTORY_FULL),
                            };
                        }
                        grants.push(work.grantItems(op.items, op.source));
                    } else {
                        work.addPoints(op.attributePoints, op.skillPoints);
                        statsChanged = true;
                    }
                }

                const before = state.workingCopy();
                state.adopt(work);
                try {
                    await this.save(room, state);
                } catch (error) {
                    state.adopt(before);
                    throw error;
                }

                state.markSeen(eventId);
                this.pushToWorld(room, state);
                this.sendInventory(room, state);
                if (statsChanged) this.sendAttributes(room, state);
                if (client)
                    for (const grant of grants)
                        inventoryGlobalService.notifyGrant(client, state, grant);
                return { eventId, result: Response.success({ revision: state.revision }) };
            } catch (error) {
                console.error(`[PlayerData] Apply changes for ${playerId} failed:`, error);
                // Lỗi hạ tầng (DB...) chứ không phải lỗi nghiệp vụ: world giữ lô và gửi lại cùng `eventId`.
                return { eventId, result: Response.error(CommonCode.INTERNAL_ERROR) };
            }
        });
    }

    /**
     * Backup từ world: lưu phần world làm chủ xuống DB (global không giữ bản sao). World có revision cũ hơn bản của global thì trả
     * kèm snapshot ("cập nhật ngược lại").
     */
    syncEntries(room: GlobalRoom, entries: PlayerSyncEntry[]): Promise<PlayerSyncEntryResult[]> {
        return Promise.all(entries.map((entry) => this.syncEntry(room, entry)));
    }

    private syncEntry(room: GlobalRoom, entry: PlayerSyncEntry): Promise<PlayerSyncEntryResult> {
        const { playerId, baseRevision } = entry;
        return this.exclusive(playerId, async (): Promise<PlayerSyncEntryResult> => {
            try {
                const state = await this.load(room, playerId);
                const worldIsBehind = baseRevision < state.revision;
                await this.save(room, state, entry.world);
                return {
                    playerId,
                    revision: state.revision,
                    ...(worldIsBehind ? { data: state.toSnapshot() } : {}),
                };
            } catch (error) {
                console.error(`[PlayerData] Sync player ${playerId} failed:`, error);
                return { playerId, code: PlayerErrorCode.PLAYER_NOT_FOUND };
            }
        });
    }

    /** Nạp PlayerData của người vừa kết nối global (nếu chưa có) để command của họ tra được. */
    async connect(room: GlobalRoom, playerId: string): Promise<void> {
        await this.exclusive(playerId, () => this.load(room, playerId));
    }

    /** Dọn PlayerData của người chơi không còn kết nối global lẫn vị trí trong world. */
    releaseIfIdle(room: GlobalRoom, playerId: string): Promise<void> {
        return this.exclusive(playerId, async () => {
            if (room.sessionOf.has(playerId) || room.state.players.get(playerId)?.inWorld) return;
            room.state.players.delete(playerId);
        });
    }
}

export const playerDataGlobalService = new PlayerDataGlobalService();
