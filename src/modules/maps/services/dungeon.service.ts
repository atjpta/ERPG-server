import type { DungeonPhase } from "@/modules/maps/entities/game-map.entity.js";

export class DungeonService {
    /** Level quái = trung bình level người trong instance làm tròn lên, trong [1, maxLevel]. */
    dungeonMonsterLevel(levels: readonly number[], maxLevel: number): number {
        if (levels.length === 0) return 1;
        const average = levels.reduce((sum, level) => sum + level, 0) / levels.length;
        return Math.min(maxLevel, Math.max(1, Math.ceil(average)));
    }

    /** Tổng số quái của các phase (kể cả phase chưa spawn). */
    phasesMonsterCount(phases: readonly Pick<DungeonPhase, "monsterSpawns">[]) {
        return phases.reduce(
            (sum, phase) => sum + phase.monsterSpawns.reduce((n, spawn) => n + spawn.count, 0),
            0
        );
    }
}

export const dungeonService = new DungeonService();
