import {
    CrowdControlType,
    DamageScalingType,
    DamageType,
    HitDelivery,
    HitShape,
    ResourceType,
    SkillEffectType,
    StatusEffectType,
} from "@/modules/skills/enums/skill.enum.js";
import type {
    SkillArea,
    SkillHitEvent,
    SkillProjectile,
} from "@/modules/skills/schemas/skill-config.schema.js";

/** Builders shared by the skill seed and the skill files (`data/*.skill.json`). */

export const damage = (
    scalingValue: number,
    scalingType = DamageScalingType.ATTACK,
    damageType = DamageType.PHYSICAL
) => ({
    effectType: SkillEffectType.DAMAGE,
    baseValue: 0,
    scalingType,
    scalingValue,
    durationMs: 0,
    damageType,
    resourceType: ResourceType.NONE,
    crowdControlType: CrowdControlType.NONE,
});

export const stun = (durationMs: number) => ({
    effectType: SkillEffectType.APPLY_STATUS,
    baseValue: 0,
    scalingType: DamageScalingType.NONE,
    scalingValue: 0,
    durationMs,
    damageType: DamageType.PHYSICAL,
    resourceType: ResourceType.NONE,
    statusEffectType: StatusEffectType.CONTROL,
    crowdControlType: CrowdControlType.STUN,
});

/** Đẩy lùi: `baseValue` = quãng (ô) tính từ người đánh ra xa, `durationMs` = thời gian bị đẩy (mục tiêu choáng suốt lúc đó). */
export const knockback = (distance: number, durationMs: number) => ({
    effectType: SkillEffectType.KNOCKBACK,
    baseValue: distance,
    scalingType: DamageScalingType.NONE,
    scalingValue: 0,
    durationMs,
    damageType: DamageType.PHYSICAL,
    resourceType: ResourceType.NONE,
    statusEffectType: StatusEffectType.CONTROL,
    crowdControlType: CrowdControlType.KNOCKBACK,
});

export const hitEvent = (params: {
    eventIndex: number;
    triggerTicks: number;
    shape: HitShape;
    range: number;
    width?: number;
    height?: number;
    radius?: number;
    angle?: number;
    damageScaling: number;
    damageScalingType?: DamageScalingType;
    damageType?: DamageType;
    /** Vùng đánh xoay theo hướng ngắm (về phía target đang chọn, không có thì theo hướng mặt) thay vì chỉ trái / phải. */
    aimed?: boolean;
    /** Choáng mục tiêu trúng đòn chừng này ms (đứng im, giữ nguyên anim, hết thì về idle). */
    stunMs?: number;
    /** Đẩy lùi mục tiêu trúng đòn ra xa người đánh `distance` ô trong `durationMs` ms. */
    knockback?: { distance: number; durationMs: number };
    delivery?: HitDelivery;
    projectile?: SkillProjectile;
    area?: SkillArea;
}): SkillHitEvent => ({
    eventIndex: params.eventIndex,
    triggerTicks: params.triggerTicks,
    shape: params.shape,
    range: params.range,
    width: params.width ?? 0,
    height: params.height ?? 0,
    radius: params.radius ?? 0,
    angle: params.angle ?? 90,
    ...(params.aimed && { aimed: true }),
    effects: [
        damage(params.damageScaling, params.damageScalingType, params.damageType),
        ...(params.stunMs ? [stun(params.stunMs)] : []),
        ...(params.knockback
            ? [knockback(params.knockback.distance, params.knockback.durationMs)]
            : []),
    ],
    delivery: params.delivery ?? HitDelivery.HITBOX,
    ...(params.projectile && { projectile: params.projectile }),
    ...(params.area && { area: params.area }),
});

export const level = (
    level: number,
    baseValue: number,
    scalingValue: number,
    scalingType = DamageScalingType.ATTACK
) => ({
    level,
    baseValue,
    scalingType,
    scalingValue,
});

export const basicAttackLevels = (scalingType = DamageScalingType.ATTACK) => [
    level(1, 0, 1.1, scalingType),
    level(2, 0, 1.2, scalingType),
    level(3, 0, 1.3, scalingType),
    level(4, 0, 1.4, scalingType),
    level(5, 0, 1.5, scalingType),
    level(6, 0, 1.6, scalingType),
    level(7, 0, 1.7, scalingType),
    level(8, 0, 1.8, scalingType),
    level(9, 0, 1.9, scalingType),
    level(10, 0, 2, scalingType),
];
