import { z } from "zod";
import {
    DamageScalingType,
    DamageType,
    HitDelivery,
    HitShape,
    SkillType,
    TargetType,
} from "@/modules/skills/enums/skill.enum.js";
import {
    SkillLevelConfigSchema,
    SkillAlliesSchema,
    SkillAreaSchema,
    SkillAuraSchema,
    SkillChargeSchema,
    SkillProjectileSchema,
} from "@/modules/skills/schemas/skill-config.schema.js";

const nonNegative = z.number().nonnegative();

/** One hit of a skill file; the seed turns it into the full hit event (a damage effect, an optional stun / knockback). */
export const SkillFileHitSchema = z
    .object({
        /** Ticks of the 20 ticks per second the seed is authored in (50 ms each), counted from the start of the animation. */
        triggerTicks: z.number().int().nonnegative(),
        shape: z.enum(HitShape).default(HitShape.RECT),
        range: nonNegative.default(0),
        width: nonNegative.default(0),
        height: nonNegative.default(0),
        radius: nonNegative.default(0),
        angle: nonNegative.default(90),
        aimed: z.boolean().optional(),
        /** Hits with the same group are one hit drawn frame by frame (see `hitGroup` in skill-config.schema.ts). */
        hitGroup: z.number().int().nonnegative().optional(),
        delivery: z.enum(HitDelivery).default(HitDelivery.HITBOX),
        /** Damage = attack (or magic attack) x this. AURA / ALLIES hits deal none of their own. */
        damageScaling: nonNegative.default(1),
        damageScalingType: z.enum(DamageScalingType).default(DamageScalingType.ATTACK),
        damageType: z.enum(DamageType).default(DamageType.PHYSICAL),
        stunMs: z.number().int().positive().optional(),
        knockback: z
            .object({ distance: z.number().positive(), durationMs: z.number().int().positive() })
            .optional(),
        projectile: SkillProjectileSchema.optional(),
        area: SkillAreaSchema.optional(),
        aura: SkillAuraSchema.optional(),
        allies: SkillAlliesSchema.optional(),
    })
    .superRefine((hit, ctx) => {
        const block = {
            [HitDelivery.PROJECTILE]: hit.projectile,
            [HitDelivery.AREA]: hit.area,
            [HitDelivery.AURA]: hit.aura,
            [HitDelivery.ALLIES]: hit.allies,
            [HitDelivery.HITBOX]: true,
        }[hit.delivery];
        if (!block) {
            ctx.addIssue({
                code: "custom",
                path: [hit.delivery.toLowerCase()],
                message: `delivery ${hit.delivery} needs its "${hit.delivery.toLowerCase()}" block`,
            });
        }
    });

/**
 * `data/<code>.skill.json`: a skill authored in Unity (Skill Lab) instead of in `skill.seed.ts`. The file name is the code.
 * The skill is given to `classCode` at `slot` (the class's skill order; the basic attack comes first), and its animation clip
 * is the class prefab Animator clip named after the code without the class prefix (a shared skill has no class and no clip) (`archer_rain_arrows` = `rain_arrows`).
 */
export const SkillFileSchema = z.object({
    code: z.string().regex(/^[a-z][a-z0-9_]*$/),
    /** Class that gets the skill; leave out for a shared skill nobody owns (the dash). */
    classCode: z.string().min(1).optional(),
    /** Monster that uses the skill (its attack); a skill has a class, a monster or neither. */
    monsterCode: z.string().min(1).optional(),
    /** Position in the class's skill list; leave out to put it last. */
    slot: z.number().int().nonnegative().optional(),
    skillType: z.enum(SkillType),
    targetType: z.enum(TargetType).default(TargetType.TARGET),
    castRange: nonNegative.default(0),
    castTimeMs: z.number().int().nonnegative().default(0),
    /** How long the character is locked (ms). Keep it within the animation clip. */
    animationMs: z.number().int().positive(),
    cooldownMs: z.number().int().nonnegative().default(0),
    manaCost: z.number().int().nonnegative().default(0),
    staminaCost: z.number().int().nonnegative().default(0),
    maxLevel: z.number().int().positive().default(10),
    basicAttack: z.boolean().default(false),
    /** Damage multiplier at level 1 and what each level adds (the table the seed writes into `levelConfig`). */
    levels: z
        .object({
            start: nonNegative.default(1.1),
            step: nonNegative.default(0.1),
            scalingType: z.enum(DamageScalingType).default(DamageScalingType.ATTACK),
        })
        .optional(),
    /** Level table written out in full (wins over `levels`); no `levels` and no `levelConfig` = the skill does not level. */
    levelConfig: z.array(SkillLevelConfigSchema).optional(),
    charge: SkillChargeSchema.partial().optional(),
    hits: z.array(SkillFileHitSchema).default([]),
});

export type SkillFileHit = z.infer<typeof SkillFileHitSchema>;
export type SkillFile = z.infer<typeof SkillFileSchema>;
