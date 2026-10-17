import type { WorldRoom } from "@/rooms/world/world.room.js";

/** Drain asynchronous allocations before persisting or removing players from the world. */
export class RewardTasksWorldService {
    private readonly tasks = new WeakMap<WorldRoom, Map<string, Set<Promise<void>>>>();
    track(room: WorldRoom, task: Promise<void>, sessionIds = [...room.state.players.keys()]): void {
        const pending = this.tasks.get(room) ?? new Map<string, Set<Promise<void>>>();
        this.tasks.set(room, pending);
        const handled = task
            .catch((error) => console.error("[World] Reward allocation failed:", error))
            .finally(() => {
                for (const sessionId of sessionIds) {
                    const tasks = pending.get(sessionId);
                    tasks?.delete(handled);
                    if (!tasks?.size) pending.delete(sessionId);
                }
            });
        for (const sessionId of sessionIds) {
            const tasks = pending.get(sessionId) ?? new Set<Promise<void>>();
            tasks.add(handled);
            pending.set(sessionId, tasks);
        }
    }
    async wait(room: WorldRoom, sessionId?: string): Promise<void> {
        const pending = this.tasks.get(room);
        const tasks = () =>
            sessionId === undefined
                ? [...(pending?.values() ?? [])].flatMap((set) => [...set])
                : [...(pending?.get(sessionId) ?? [])];
        for (let current = tasks(); current.length; current = tasks()) await Promise.all(current);
    }
}
export const rewardTasksWorldService = new RewardTasksWorldService();
