import type { Direction } from "@/modules/player/enums/player.enum.js";
import { playerService } from "@/modules/player/user/services/player.service.js";
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

        const snapshots = [...room.state.players.entries()].flatMap(([sessionId, player]) => {
            if (room.isLeavingSession(sessionId)) return [];
            return [
                {
                    sessionId,
                    player,
                    x: player.x,
                    y: player.y,
                    direction: player.direction,
                    hp: player.hp,
                    mp: player.mp,
                    stateRevision: player.stateRevision,
                },
            ];
        });

        const checkpoint = Promise.all(
            snapshots.map(async (snapshot) => {
                try {
                    const saved = await playerService.saveState(
                        snapshot.player.id,
                        {
                            mapCode: room.map.code,
                            x: snapshot.x,
                            y: snapshot.y,
                            direction: snapshot.direction as Direction,
                            hp: snapshot.hp,
                            mp: snapshot.mp,
                        },
                        snapshot.stateRevision
                    );
                    const current = room.state.players.get(snapshot.sessionId);
                    if (current) current.setStateRevision(saved.revision);
                } catch (err) {
                    console.error(
                        `[WorldRoom] Checkpoint player ${snapshot.player.id} failed:`,
                        err
                    );
                    if (
                        !(err instanceof Error) ||
                        !err.message.includes("Player state changed while online") ||
                        !room.state.players.has(snapshot.sessionId)
                    ) {
                        return;
                    }
                    try {
                        const latest = await playerService.getPlayableSnapshotOrFail(
                            snapshot.player.id
                        );
                        const current = room.state.players.get(snapshot.sessionId);
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

    waitForCheckpoint(room: WorldRoom): Promise<void> {
        return this.checkpointPromises.get(room) ?? Promise.resolve();
    }
}

export const worldService = new WorldService();
