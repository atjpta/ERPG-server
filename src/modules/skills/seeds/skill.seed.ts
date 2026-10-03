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
    triggerMs: number;
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
    triggerMs: params.triggerMs,
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
                triggerMs: 350,
                shape: HitShape.ARC,
                range: 1,
                width: 1.4,
                radius: 1,
                angle: 100,
                damageScaling: 1.25,
            }),
        ],
    },
    {
        code: "swordman_slash",
        skillType: SkillType.MELEE,
        targetType: TargetType.DIRECTION,
        castRange: 1.5,
        castTimeMs: 100,
        cooldownMs: 900,
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
                triggerMs: 80,
                shape: HitShape.ARC,
                range: 1.4,
                width: 1.2,
                radius: 1.4,
                angle: 90,
                damageScaling: 0.35,
            }),
            hitEvent({
                eventIndex: 1,
                triggerMs: 240,
                shape: HitShape.ARC,
                range: 1.5,
                width: 1.25,
                radius: 1.5,
                angle: 95,
                damageScaling: 0.4,
            }),
            hitEvent({
                eventIndex: 2,
                triggerMs: 460,
                shape: HitShape.ARC,
                range: 1.7,
                width: 1.4,
                radius: 1.7,
                angle: 110,
                damageScaling: 0.65,
            }),
        ],
    },
];

export const SkillSeed = async (force = false) => {
    for (const skill of SKILLS) {
        await SkillRepo.upsert({
            data: skill,
            target: Skills.code,
            matchValue: skill.code,
            updateData: force ? skill : undefined,
        });
    }
    console.info("✅ [SkillSeed] Done");
};
