import { playerService } from "@/modules/player/services/player.service.js";
import { dialogueWorldService } from "@/rooms/world/modules/content/services/dialogue.world.service.js";
import { PartyDetachWorldCommand } from "@/rooms/world/modules/players/commands/party-detach.world.command.js";
import type { MoveBounds } from "@/rooms/world/modules/players/simulation/movement.step.js";
import { playerDataWorldService } from "@/rooms/world/modules/players/services/player-data.world.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

interface WorldChainState {
    attacking: boolean;
    attackCooldownTicks: number;
}

export class WorldService {
    private readonly checkpointPromises = new WeakMap<WorldRoom, Promise<void>>();

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

    /** Backup mọi player đang chơi lên global (global lưu DB). Chỉ chạy một lượt tại một thời điểm. */
    checkpointPlayers(room: WorldRoom): Promise<void> {
        const runningCheckpoint = this.checkpointPromises.get(room);
        if (runningCheckpoint) return runningCheckpoint;

        const playerIds = [...room.state.players.keys()].filter(
            (playerId) => !room.leavingPlayers.has(playerId)
        );
        const checkpoint = playerDataWorldService
            .sync(room, playerIds)
            .then((): void => undefined)
            .finally(() => {
                this.checkpointPromises.delete(room);
            });

        this.checkpointPromises.set(room, checkpoint);
        return checkpoint;
    }

    /**
     * Lưu ngay 1 player (đổi map, vào/ra dungeon, trả quest — không để thoát game chơi lại kết quả).
     * Chạy nối tiếp với checkpoint của room.
     */
    async savePlayer(room: WorldRoom, playerId: string): Promise<void> {
        for (
            let running = this.checkpointPromises.get(room);
            running;
            running = this.checkpointPromises.get(room)
        ) {
            await running;
        }
        if (!room.state.players.has(playerId) || room.leavingPlayers.has(playerId)) return;

        const save = playerDataWorldService
            .sync(room, [playerId])
            .then((): void => undefined)
            .finally(() => {
                this.checkpointPromises.delete(room);
            });
        this.checkpointPromises.set(room, save);
        await save;
    }

    /** Vùng chặn hiệu lực để di chuyển: địa hình của map, cộng cổng chắn khi đang ở dungeon. */
    moveBounds(room: WorldRoom): MoveBounds {
        return room.dungeon?.bounds ?? room.map;
    }

    /** Lưu và gỡ nhân vật khỏi room (rời room hoặc bị đăng nhập trùng thay thế). */
    async releasePlayer(room: WorldRoom, playerId: string): Promise<void> {
        room.leavingPlayers.add(playerId);
        try {
            dialogueWorldService.drop(room, playerId);
            await this.waitForCheckpoint(room);
            // Lưu trước khi báo global là đã rời: global còn giữ PlayerData tới lúc nhận detach.
            await this.saveFinal(room, [playerId]);
            const leaving = room.state.players.get(playerId);
            if (leaving)
                await room.dispatcher.dispatch(new PartyDetachWorldCommand(), { player: leaving });
            room.state.players.delete(playerId);
        } finally {
            room.leavingPlayers.delete(playerId);
            room.sessionOf.delete(playerId);
        }
    }

    /** Room đóng: lưu mọi player còn lại rồi gỡ hết. */
    async disposeRoom(room: WorldRoom): Promise<void> {
        const playerIds = [...room.state.players.keys()];
        for (const playerId of playerIds) room.leavingPlayers.add(playerId);
        await this.waitForCheckpoint(room);
        await this.saveFinal(room, playerIds);
        for (const playerId of playerIds) room.state.players.delete(playerId);
    }

    /**
     * Lần lưu cuối: backup lên global; global không tới được thì ghi thẳng phần world làm chủ xuống DB (lỗi chỉ log,
     * không chặn việc dọn).
     */
    private async saveFinal(room: WorldRoom, playerIds: readonly string[]): Promise<void> {
        const saved = await playerDataWorldService.sync(room, playerIds);
        for (const playerId of playerIds) {
            const player = room.state.players.get(playerId);
            if (!player || saved.has(playerId)) continue;
            try {
                await playerService.saveState(
                    player.id,
                    player.toWorldFields(room.map.code),
                    player.stateRevision
                );
            } catch (err) {
                console.error(`[WorldRoom] Save player ${player.id} failed:`, err);
            }
        }
    }

    waitForCheckpoint(room: WorldRoom): Promise<void> {
        return this.checkpointPromises.get(room) ?? Promise.resolve();
    }
}

export const worldService = new WorldService();
