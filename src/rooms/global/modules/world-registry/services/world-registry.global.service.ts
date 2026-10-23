import type { GlobalRoom } from "@/rooms/global/global.room.js";
import type { PlayerRuntime } from "@/rooms/runtime/modules/player/runtime/player-runtime.js";

/**
 * Presence: ai đang ở world room nào. World room ghi vào `PlayerRuntime.presence` khi player vào / rời
 * (`PlayerRuntimeService.setPresence` / `clearPresence`); đây chỉ là các phép tra cứu cho tính năng social.
 */
export class WorldRegistryGlobalService {
    worldRoomOf(room: GlobalRoom, playerId: string): string | undefined {
        return room.runtime.players.get(playerId)?.presence?.worldRoomId;
    }

    isInWorld(room: GlobalRoom, playerId: string): boolean {
        return room.runtime.players.get(playerId)?.presence !== undefined;
    }

    /** Mọi player cùng map với `playerId` (cùng `mapCode`, và cùng instance nếu là dungeon), gồm cả chính họ. */
    playersOnSameMap(room: GlobalRoom, playerId: string): string[] {
        const me = room.runtime.players.get(playerId)?.presence;
        if (!me) return [];
        const same = (runtime: PlayerRuntime) =>
            runtime.presence?.mapCode === me.mapCode &&
            runtime.presence.instanceId === me.instanceId;
        return [...room.runtime.players.all()].filter(same).map((runtime) => runtime.playerId);
    }
}

export const worldRegistryGlobalService = new WorldRegistryGlobalService();
