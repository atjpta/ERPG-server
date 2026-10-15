import { z } from "zod";

const positive = z.number().positive();

/**
 * How a monster moves and how far it sees, follows and wanders (tiles), and how long it idles between walks. Authored in Unity
 * (Ranges tab of the Authoring Hub, `data/monster_ai_config.json`), because they are about where things stand on the map.
 * Every number has a base in `default`; a monster that needs another value lists only that number under `monsters`.
 */
export const MonsterAiRuleSchema = z.object({
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
    /** Tiles per second at level 1 (0 = stands still, like the training slime). The seed writes it into the monster stats. */
    moveSpeed: z.number().nonnegative(),
});

export type MonsterAiRule = z.infer<typeof MonsterAiRuleSchema>;

const consistent = (rule: MonsterAiRule, ctx: z.RefinementCtx, path: (string | number)[]) => {
    if (rule.detectionRadius > rule.leashRadius) {
        ctx.addIssue({
            code: "custom",
            path: [...path, "detectionRadius"],
            message: "detectionRadius must not exceed leashRadius",
        });
    }
    if (rule.idleMinMs > rule.idleMaxMs) {
        ctx.addIssue({
            code: "custom",
            path: [...path, "idleMinMs"],
            message: "idleMinMs must not exceed idleMaxMs",
        });
    }
};

export const MonsterAiConfigSchema = z
    .object({
        default: MonsterAiRuleSchema,
        monsters: z.record(z.string(), MonsterAiRuleSchema.partial()).default({}),
    })
    .superRefine((config, ctx) => {
        consistent(config.default, ctx, ["default"]);
        for (const [code, override] of Object.entries(config.monsters)) {
            consistent({ ...config.default, ...override }, ctx, ["monsters", code]);
        }
    });

export type MonsterAiConfig = z.infer<typeof MonsterAiConfigSchema>;

/** The rule of one monster: its own numbers over the default. */
export const resolveMonsterAi = (config: MonsterAiConfig, monsterCode: string): MonsterAiRule => ({
    ...config.default,
    ...config.monsters[monsterCode],
});

export const DEFAULT_MONSTER_AI_CONFIG: MonsterAiConfig = {
    default: {
        detectionRadius: 6,
        leashRadius: 8,
        roamRadius: 4,
        roamArrivalDistance: 0.15,
        idleMinMs: 1000,
        idleMaxMs: 3000,
        moveSpeed: 1,
    },
    monsters: {},
};
