import { z } from "zod";
import {
    CastType,
    CrowdControlType,
    DamageScalingType,
    DamageType,
    HitDelivery,
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

/**
 * Đạn của hit event PROJECTILE: sinh ra tại `offsetX/offsetY` của event (như HITBOX), bay thẳng về phía
 * mục tiêu lúc bắn (không có mục tiêu → theo hướng mặt). Thân đạn là hình tròn `radius` ô.
 */
export const SkillProjectileSchema = z.object({
    movementType: z.enum(ProjectileMovementType).default(ProjectileMovementType.STRAIGHT),
    hitBehavior: z.enum(ProjectileHitBehavior).default(ProjectileHitBehavior.DESTROY),
    /** Ô / giây. */
    speed: z.number().positive(),
    /** Bay quá quãng này (ô) thì biến mất. */
    maxDistance: z.number().positive(),
    radius: nonNegative.default(0.15),
    /** PIERCE: số mục tiêu tối đa (mỗi mục tiêu trúng 1 lần); DESTROY luôn là 1. */
    maxHits: z.number().int().positive().default(1),
});

/**
 * Vùng của hit event AREA: tâm đặt tại mục tiêu lúc event nổ (trong `castRange` của skill; không có
 * mục tiêu → cách người đánh `untargetedDistance` ô theo hướng mặt), dùng `shape`/`radius` của event
 * (offset bỏ qua), gây damage sau `delayMs`.
 */
export const SkillAreaSchema = z.object({
    delayMs: z.number().int().nonnegative().default(0),
    untargetedDistance: nonNegative.default(1),
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
    /** Mặc định HITBOX: vùng (shape/offset ở trên) quanh người đánh, nổ ngay tại `triggerTicks`. */
    delivery: z.enum(HitDelivery).default(HitDelivery.HITBOX),
    /** Bắt buộc khi `delivery = PROJECTILE`. */
    projectile: SkillProjectileSchema.optional(),
    /** Bắt buộc khi `delivery = AREA`. */
    area: SkillAreaSchema.optional(),
});

export const SkillConfigSchema = z.object({
    castType: z.enum(CastType).default(CastType.INSTANT),
    interruptReasons: z.array(z.string()).default([]),
    targetRelations: z.array(z.enum(TargetRelation)).default([]),
    targetEntityTypes: z.array(z.enum(TargetEntityType)).default([]),
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
export type SkillProjectile = z.infer<typeof SkillProjectileSchema>;
export type SkillArea = z.infer<typeof SkillAreaSchema>;
export type SkillConfig = z.infer<typeof SkillConfigSchema>;
