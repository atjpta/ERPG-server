import { z } from "zod";

const positive = z.number().positive();

/**
 * How far a monster sees, follows and wanders (tiles), and how long it idles between walks. Authored in Unity (Ranges tab of the
 * Authoring Hub, `data/monster_ai_config.json`), because they are about where things stand on the map.
 */
export const MonsterAiConfigSchema = z
    .object({
        /** A player this close to the monster (and inside the leash) is chased. */
        detectionRadius: positive,
        /** The monster gives up a target that is farther than this from where the monster spawned. */
        leashRadius: positive,
        /** Idle monsters wander inside this circle around their spawn. */
        roamRadius: positive,
        /** A wandering monster that is this close to its goal has arrived. */
        roamArrivalDistance: positive,
        idleMinMs: z.number().int().nonnegative(),
        idleMaxMs: z.number().int().nonnegative(),
    })
    .refine((config) => config.detectionRadius <= config.leashRadius, {
        message: "detectionRadius must not exceed leashRadius",
        path: ["detectionRadius"],
    })
    .refine((config) => config.idleMinMs <= config.idleMaxMs, {
        message: "idleMinMs must not exceed idleMaxMs",
        path: ["idleMinMs"],
    });

export type MonsterAiConfig = z.infer<typeof MonsterAiConfigSchema>;

export const DEFAULT_MONSTER_AI_CONFIG: MonsterAiConfig = {
    detectionRadius: 6,
    leashRadius: 8,
    roamRadius: 4,
    roamArrivalDistance: 0.15,
    idleMinMs: 1000,
    idleMaxMs: 3000,
};
