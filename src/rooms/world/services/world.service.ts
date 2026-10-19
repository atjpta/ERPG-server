import { playerService } from "@/modules/player/services/player.service.js";
import { rewardTasksWorldService } from "@/rooms/world/modules/rewards/services/reward-tasks.world.service.js";
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

    checkpointPlayers(room: WorldRoom): Promise<void> {
        const runningCheckpoint = this.checkpointPromises.get(room);
        if (runningCheckpoint) return runningCheckpoint;

        const snapshots = [...room.state.players.entries()].flatMap(([playerId, player]) => {
            if (room.isLeavingPlayer(playerId)) return [];
            return [
                {
                    playerId,
                    player,
                    // Chụp lại ngay (không đợi await) để không lẫn thay đổi của tick sau.
                    data: player.toSavedState(room.map.code),
                    stateRevision: player.stateRevision,
                },
            ];
        });

        const checkpoint = Promise.all(
            snapshots.map(async (snapshot) => {
                try {
                    const saved = await playerService.saveState(
                        snapshot.player.id,
                        snapshot.data,
                        snapshot.stateRevision
                    );
                    const current = room.state.players.get(snapshot.playerId);
                    if (current) current.setStateRevision(saved.revision);
                } catch (err) {
                    console.error(
                        `[WorldRoom] Checkpoint player ${snapshot.player.id} failed:`,
                        err
                    );
                    if (
                        !(err instanceof Error) ||
                        !err.message.includes("Player state changed while online") ||
                        !room.state.players.has(snapshot.playerId)
                    ) {
                        return;
                    }
                    try {
                        const latest = await playerService.getPlayableSnapshotOrFail(
                            snapshot.player.id
                        );
                        const current = room.state.players.get(snapshot.playerId);
                        if (!current) return;
                        current.syncSnapshot(latest);
                    } catch {
                        // Player may have been banned/deleted while the checkpoint was running.
                    }
                }
            })
        )
            .then((): void => undefined)
            .finally(() => {
                this.checkpointPromises.delete(room);
            });

        this.checkpointPromises.set(room, checkpoint);
        return checkpoint;
    }

    /**
     * Lưu ngay 1 player (sau cường hoá / tinh hoá / phân rã — không để thoát game chơi lại kết quả).
     * Chạy nối tiếp với checkpoint của room để không lệch `stateRevision`.
     */
    async savePlayer(room: WorldRoom, playerId: string): Promise<void> {
        await rewardTasksWorldService.wait(room, playerId);
        for (
            let running = this.checkpointPromises.get(room);
            running;
            running = this.checkpointPromises.get(room)
        ) {
            await running;
        }
        const player = room.state.players.get(playerId);
        if (!player || room.isLeavingPlayer(playerId)) return;

        const save = playerService
            .saveState(player.id, player.toSavedState(room.map.code), player.stateRevision)
            .then((saved) => {
                room.state.players.get(playerId)?.setStateRevision(saved.revision);
            })
            .catch((err: unknown) => {
                console.error(`[WorldRoom] Save player ${player.id} failed:`, err);
            })
            .finally(() => {
                this.checkpointPromises.delete(room);
            });
        this.checkpointPromises.set(room, save);
        await save;
    }

    waitForCheckpoint(room: WorldRoom): Promise<void> {
        return this.checkpointPromises.get(room) ?? Promise.resolve();
    }
}

export const worldService = new WorldService();
