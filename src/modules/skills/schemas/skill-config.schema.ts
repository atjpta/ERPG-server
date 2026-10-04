import { z } from "zod";
import {
    CastType,
    CrowdControlType,
    DamageScalingType,
    DamageType,
    HitShape,
    ProjectileHitBehavior,
    ProjectileMovementType,
    ResourceType,
    SkillEffectType,
    StatusEffectType,
    TargetEntityType,
    TargetRelation,
} from "@/modules/skills/enums/skill.enum.js";

const nonNegative = z.number().nonnegative();

export const SkillLevelConfigSchema = z.object({
    level: z.number().int().positive(),
    baseValue: nonNegative.default(0),
    scalingType: z.enum(DamageScalingType).default(DamageScalingType.NONE),
    scalingValue: z.number().default(0),
});

export const SkillEffectSchema = z.object({
    effectType: z.enum(SkillEffectType),
    baseValue: z.number().default(0),
    scalingType: z.enum(DamageScalingType).default(DamageScalingType.NONE),
    scalingValue: z.number().default(0),
    durationMs: z.number().int().nonnegative().default(0),
    damageType: z.enum(DamageType).default(DamageType.PHYSICAL),
    resourceType: z.enum(ResourceType).default(ResourceType.NONE),
    statusEffectType: z.enum(StatusEffectType).optional(),
    crowdControlType: z.enum(CrowdControlType).default(CrowdControlType.NONE),
    statusCode: z.string().max(64).optional(),
});

export const SkillHitEventSchema = z.object({
    eventIndex: z.number().int().nonnegative(),
    triggerTicks: z.number().int().nonnegative().default(0),
    shape: z.enum(HitShape),
    range: nonNegative.default(0),
    offsetX: z.number().default(0),
    offsetY: z.number().default(0),
    width: nonNegative.default(0),
    height: nonNegative.default(0),
    radius: nonNegative.default(0),
    angle: nonNegative.default(90),
    effects: z.array(SkillEffectSchema).default([]),
});

export const SkillConfigSchema = z.object({
    castType: z.enum(CastType).default(CastType.INSTANT),
    interruptReasons: z.array(z.string()).default([]),
    targetRelations: z.array(z.enum(TargetRelation)).default([]),
    targetEntityTypes: z.array(z.enum(TargetEntityType)).default([]),
    projectile: z
        .object({
            movementType: z.enum(ProjectileMovementType),
            hitBehavior: z.enum(ProjectileHitBehavior),
            speed: nonNegative.default(0),
            maxTravelDistance: nonNegative.default(0),
            lifetimeMs: z.number().int().nonnegative().default(0),
        })
        .optional(),
    hitEvents: z.array(SkillHitEventSchema).default([]),
});

/** Một skill mà player/monster sở hữu (cột `skills` của `player_states` và `monsters`). */
export const OwnedSkillSchema = z.object({
    skillId: z.uuid(),
    level: z.number().int().positive().default(1),
});

export type OwnedSkill = z.infer<typeof OwnedSkillSchema>;
export type SkillLevelConfig = z.infer<typeof SkillLevelConfigSchema>;
export type SkillEffect = z.infer<typeof SkillEffectSchema>;
export type SkillHitEvent = z.infer<typeof SkillHitEventSchema>;
export type SkillConfig = z.infer<typeof SkillConfigSchema>;
