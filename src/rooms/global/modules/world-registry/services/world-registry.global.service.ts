import type { GlobalRoom } from "@/rooms/global/global.room.js";
import { playerDataGlobalService } from "@/rooms/global/modules/player-data/services/player-data.global.service.js";

/**
 * Presence: ai đang ở world room nào. World room báo lên bằng RPC (`AttachWorld` / `DetachWorld` / `HeartbeatWorld`);
 * dữ liệu là field `worldRoomId` / `mapCode` / `instanceId` / `seenAt` của `PlayerDataState`.
 */
export class WorldRegistryGlobalService {
    worldRoomOf(room: GlobalRoom, playerId: string): string | undefined {
        return room.state.players.get(playerId)?.worldRoomId;
    }

    isInWorld(room: GlobalRoom, playerId: string): boolean {
        return room.state.players.get(playerId)?.inWorld ?? false;
    }

    /** World room mới nhận player (vào game / đổi map): ghi đè vị trí cũ. */
    attachWorld(
        room: GlobalRoom,
        playerId: string,
        worldRoomId: string,
        where: { mapCode: string; instanceId?: string },
        nowMs: number
    ): Promise<void> {
        return playerDataGlobalService.exclusive(playerId, async () => {
            const state = await playerDataGlobalService.load(room, playerId);
            state.enterWorld(worldRoomId, where, nowMs);
        });
    }

    /** Chỉ xoá khi vẫn trỏ về `worldRoomId` này (room mới có thể đã ghi đè khi đổi map). */
    detachWorld(room: GlobalRoom, playerId: string, worldRoomId: string): boolean {
        const state = room.state.players.get(playerId);
        if (state?.worldRoomId !== worldRoomId) return false;
        state.leaveWorld();
        return true;
    }

    /** Heartbeat của world room: làm mới (hoặc dựng lại) vị trí của các player nó đang giữ. */
    async refreshWorld(
        room: GlobalRoom,
        worldRoomId: string,
        where: { mapCode: string; instanceId?: string },
        playerIds: readonly string[],
        nowMs: number
    ): Promise<void> {
        for (const playerId of playerIds) {
            const state = room.state.players.get(playerId);
            if (!state?.inWorld) {
                await this.attachWorld(room, playerId, worldRoomId, where, nowMs);
            } else if (state.worldRoomId === worldRoomId) {
                state.enterWorld(worldRoomId, where, nowMs);
            }
        }
    }

    /** Dọn vị trí không được làm mới trong `maxAgeMs` (world room chết không kịp detach); trả về `playerId` đã bị dọn. */
    pruneStaleWorld(room: GlobalRoom, nowMs: number, maxAgeMs: number): string[] {
        const stale: string[] = [];
        for (const [playerId, state] of room.state.players) {
            if (state.inWorld && nowMs - state.seenAt > maxAgeMs) {
                state.leaveWorld();
                stale.push(playerId);
            }
        }
        return stale;
    }

    /** Mọi player cùng map với `playerId` (cùng `mapCode`, và cùng instance nếu là dungeon), gồm cả chính họ. */
    playersOnSameMap(room: GlobalRoom, playerId: string): string[] {
        const me = room.state.players.get(playerId);
        if (!me?.inWorld) return [];
        return [...room.state.players]
            .filter(
                ([, state]) =>
                    state.inWorld &&
                    state.mapCode === me.mapCode &&
                    state.instanceId === me.instanceId
            )
            .map(([id]) => id);
    }
}

export const worldRegistryGlobalService = new WorldRegistryGlobalService();
