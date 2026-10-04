import { Skills, type NewSkill } from "@/modules/skills/entities/skill.entity.js";
import {
    DamageScalingType,
    DamageType,
    CrowdControlType,
    HitShape,
    ResourceType,
    SkillEffectType,
    SkillType,
    TargetType,
} from "@/modules/skills/enums/skill.enum.js";
import { SkillRepo } from "@/modules/skills/repositories/skill.repository.js";

const damage = (scalingValue: number) => ({
    effectType: SkillEffectType.DAMAGE,
    baseValue: 0,
    scalingType: DamageScalingType.ATTACK,
    scalingValue,
    durationMs: 0,
    damageType: DamageType.PHYSICAL,
    resourceType: ResourceType.NONE,
    crowdControlType: CrowdControlType.NONE,
});

const hitEvent = (params: {
    eventIndex: number;
    triggerTicks: number;
    shape: HitShape;
    range: number;
    width?: number;
    height?: number;
    radius?: number;
    angle?: number;
    offsetX?: number;
    offsetY?: number;
    damageScaling: number;
}) => ({
    eventIndex: params.eventIndex,
    triggerTicks: params.triggerTicks,
    shape: params.shape,
    range: params.range,
    offsetX: params.offsetX ?? 0,
    offsetY: params.offsetY ?? 0,
    width: params.width ?? 0,
    height: params.height ?? 0,
    radius: params.radius ?? 0,
    angle: params.angle ?? 90,
    effects: [damage(params.damageScaling)],
});

const level = (level: number, baseValue: number, scalingValue: number) => ({
    level,
    baseValue,
    scalingType: DamageScalingType.ATTACK,
    scalingValue,
});

const SKILLS: NewSkill[] = [
    {
        code: "orc_slash",
        skillType: SkillType.MELEE,
        targetType: TargetType.DIRECTION,
        castRange: 1,
        castTimeMs: 350,
        cooldownMs: 2000,
        manaCost: 0,
        staminaCost: 0,
        maxLevel: 1,
        levelConfig: [level(1, 2, 0.25)],
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks: 3,
                shape: HitShape.RECT,
                range: 1.08,
                width: 0.84,
                offsetX: -0.33,
                offsetY: 0.33,
                damageScaling: 1.25,
            }),
        ],
    },
    {
        code: "swordman_slash_1",
        skillType: SkillType.MELEE,
        targetType: TargetType.DIRECTION,
        castRange: 1.4,
        // Thời lượng cả đòn (khoá di chuyển) — khớp AttackDurationTicks bên client; anim Attack01 350 ms; hit frame 3.
        castTimeMs: 400,
        cooldownMs: 0,
        manaCost: 0,
        staminaCost: 3,
        maxLevel: 5,
        levelConfig: [
            level(1, 8, 0.3),
            level(2, 10, 0.35),
            level(3, 12, 0.4),
            level(4, 14, 0.45),
            level(5, 16, 0.5),
        ],
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks: 3,
                shape: HitShape.RECT,
                range: 1.3,
                width: 0.56,
                offsetX: -0.33,
                offsetY: 0.26,
                damageScaling: 1,
            }),
        ],
    },
    {
        code: "swordman_slash_2",
        skillType: SkillType.MELEE,
        targetType: TargetType.DIRECTION,
        castRange: 1.5,
        // Thời lượng cả đòn (khoá di chuyển) — khớp AttackDurationTicks bên client; anim Attack02 750 ms; hit frame 3/6/12.
        castTimeMs: 750,
        cooldownMs: 0,
        manaCost: 0,
        staminaCost: 3,
        maxLevel: 5,
        levelConfig: [
            level(1, 8, 0.3),
            level(2, 10, 0.35),
            level(3, 12, 0.4),
            level(4, 14, 0.45),
            level(5, 16, 0.5),
        ],
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks: 3,
                shape: HitShape.RECT,
                range: 1.52,
                width: 0.97,
                offsetX: -0.33,
                offsetY: 0.45,
                damageScaling: 0.5,
            }),
            hitEvent({
                eventIndex: 1,
                triggerTicks: 6,
                shape: HitShape.RECT,
                range: 1.58,
                width: 0.63,
                offsetX: -0.33,
                offsetY: 0.22,
                damageScaling: 0.5,
            }),
            hitEvent({
                eventIndex: 2,
                triggerTicks: 12,
                shape: HitShape.RECT,
                range: 1.77,
                width: 0.94,
                offsetX: -0.33,
                offsetY: 0.38,
                damageScaling: 0.5,
            }),
        ],
    },
    {
        code: "swordman_slash_3",
        skillType: SkillType.MELEE,
        targetType: TargetType.DIRECTION,
        castRange: 1.7,
        // Thời lượng cả đòn (khoá di chuyển) — khớp AttackDurationTicks bên client; anim Attack03
        // (speed 2.4) 500 ms, 5 nhát đâm ở frame 5–9 (208/250/292/333/375 ms).
        castTimeMs: 500,
        cooldownMs: 0,
        manaCost: 0,
        staminaCost: 3,
        maxLevel: 5,
        levelConfig: [
            level(1, 8, 0.3),
            level(2, 10, 0.35),
            level(3, 12, 0.4),
            level(4, 14, 0.45),
            level(5, 16, 0.5),
        ],
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks: 4,
                shape: HitShape.RECT,
                range: 1.27,
                width: 0.41,
                offsetX: -0.33,
                offsetY: 0.33,
                damageScaling: 0.4,
            }),
            hitEvent({
                eventIndex: 1,
                triggerTicks: 5,
                shape: HitShape.RECT,
                range: 1.49,
                width: 0.5,
                offsetX: -0.33,
                offsetY: 0.28,
                damageScaling: 0.4,
            }),
            hitEvent({
                eventIndex: 2,
                triggerTicks: 6,
                shape: HitShape.RECT,
                range: 1.42,
                width: 0.47,
                offsetX: -0.33,
                offsetY: 0.33,
                damageScaling: 0.4,
            }),
            hitEvent({
                eventIndex: 3,
                triggerTicks: 7,
                shape: HitShape.RECT,
                range: 1.52,
                width: 0.47,
                offsetX: -0.33,
                offsetY: 0.33,
                damageScaling: 0.4,
            }),
            hitEvent({
                eventIndex: 4,
                triggerTicks: 7,
                shape: HitShape.RECT,
                range: 1.36,
                width: 0.34,
                offsetX: -0.33,
                offsetY: 0.3,
                damageScaling: 0.4,
            }),
        ],
    },
];

export const SkillSeed = async () => {
    for (const skill of SKILLS) {
        await SkillRepo.upsert({
            data: skill,
            target: Skills.code,
            matchValue: skill.code,
            updateData: skill,
        });
    }

    const legacySlash = await SkillRepo.findByCode({ code: "swordman_slash" });
    if (legacySlash?.enabled) {
        await SkillRepo.updateById({ id: legacySlash.id, data: { enabled: false } });
    }
    console.info("✅ [SkillSeed] Done");
};
