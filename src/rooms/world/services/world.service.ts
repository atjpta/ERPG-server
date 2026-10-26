import { PlayerDataGroup } from "@/modules/player/enums/player-state.enum.js";
import type { MoveBounds } from "@/modules/player/simulation/movement.step.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

interface WorldChainState {
    attacking: boolean;
    attackCooldownTicks: number;
}

export class WorldService {
    chainEntities<TItem, TState extends WorldChainState>(
        items: Iterable<TItem>,
        getState: (item: TItem) => TState,
        chain: (item: TItem, state: TState) => void
    ): void {
        for (const item of items) {
            const state = getState(item);
            state.attacking = false;
            chain(item, state);
            if (state.attackCooldownTicks > 0) state.attackCooldownTicks--;
        }
    }

    /**
     * Lưu ngay 1 player (đổi map, vào/ra dungeon, trả quest — không để thoát game chơi lại kết quả): chụp vị trí / HP từ room
     * rồi ghi nhóm tiến độ + vị trí xuống DB.
     */
    async savePlayer(room: WorldRoom, playerId: string): Promise<void> {
        if (!room.state.players.has(playerId) || room.leavingPlayers.has(playerId)) return;
        await room.playerStates.save(playerId, [PlayerDataGroup.PROGRESS, PlayerDataGroup.PLACE]);
    }

    /** Vùng chặn hiệu lực để di chuyển: địa hình của map, cộng cổng chắn khi đang ở dungeon. */
    moveBounds(room: WorldRoom): MoveBounds {
        return room.dungeon?.bounds ?? room.map;
    }

    /** Lưu và gỡ nhân vật khỏi room (rời room hoặc bị đăng nhập trùng thay thế). */
    async releasePlayer(room: WorldRoom, playerId: string): Promise<void> {
        room.leavingPlayers.add(playerId);
        try {
            room.dialogues.drop(playerId);
            room.npcFunctions.drop(playerId);
            const leaving = room.state.players.get(playerId);
            if (leaving) {
                // Lưu vị trí / tiến độ cuối cùng khi room này còn là nơi giữ player, rồi báo đã rời (đổi map thì giữ party).
                await room.playerStates.save(playerId, [
                    PlayerDataGroup.PROGRESS,
                    PlayerDataGroup.PLACE,
                ]);
                const playerState = leaving.playerState;
                room.playerStates.clearPresence(
                    playerState,
                    room.roomId,
                    leaving.pendingMapCode !== undefined
                );
                await room.playerStates.detach(playerId, room.attachUser);
            }
            room.state.players.delete(playerId);
        } finally {
            room.leavingPlayers.delete(playerId);
            room.sessionOf.delete(playerId);
        }
    }

    /** Room đóng: lưu mọi player còn lại rồi gỡ hết. */
    async disposeRoom(room: WorldRoom): Promise<void> {
        for (const playerId of [...room.state.players.keys()]) {
            await this.releasePlayer(room, playerId);
        }
    }
}

export const worldService = new WorldService();
