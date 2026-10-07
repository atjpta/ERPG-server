import { Skills, type NewSkill } from "@/modules/skills/entities/skill.entity.js";
import {
    DamageScalingType,
    DamageType,
    CrowdControlType,
    HitDelivery,
    HitShape,
    ProjectileHitBehavior,
    ProjectileMovementType,
    ResourceType,
    SkillEffectType,
    SkillType,
    TargetType,
} from "@/modules/skills/enums/skill.enum.js";
import { SkillRepo } from "@/modules/skills/repositories/skill.repository.js";
import type {
    SkillArea,
    SkillHitEvent,
    SkillProjectile,
} from "@/modules/skills/schemas/skill-config.schema.js";
import { big, bigToNumber, floorBig } from "@/core/utils/big-number.util.js";
import {
    MONSTER_DEFINITIONS,
    monsterAttackSkillCode,
    type MonsterDefinition,
} from "@/modules/monsters/seeds/monster.seed-data.js";
import { BASE_SKILL_TICK_RATE } from "@/rooms/world/utils/tick.world.util.js";

const damage = (
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
    damageScalingType?: DamageScalingType;
    damageType?: DamageType;
    delivery?: HitDelivery;
    projectile?: SkillProjectile;
    area?: SkillArea;
}): SkillHitEvent => ({
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
    effects: [damage(params.damageScaling, params.damageScalingType, params.damageType)],
    delivery: params.delivery ?? HitDelivery.HITBOX,
    ...(params.projectile && { projectile: params.projectile }),
    ...(params.area && { area: params.area }),
});

const level = (
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

const basicAttackLevels = (scalingType = DamageScalingType.ATTACK) => [
    level(1, 0, 1.1, scalingType),
    level(2, 0, 1.2, scalingType),
    level(3, 0, 1.3, scalingType),
    level(4, 0, 1.4, scalingType),
    level(5, 0, 1.5, scalingType),
];

/**
 * Đòn đánh thường (`basicAttack`) của 3 class khởi đầu, canh theo anim trong
 * `Assets/ERPG/Animation/PackCharacters/<Class>` (12 fps × speed của state trong controller).
 * `castTimeMs` = thời lượng cả đòn (khoá di chuyển), luôn ≥ lúc gây damage cuối + 150 ms.
 */
const CLASS_SKILLS: NewSkill[] = [
    {
        // basic_attack (clip Attack1 cũ, speed 2, 7 frame = 292 ms), chém ở frame 3. Cần thêm đòn thì thêm skill + clip sau.
        code: "swordsman_basic_attack",
        skillType: SkillType.MELEE,
        targetType: TargetType.DIRECTION,
        castRange: 1.4,
        castTimeMs: 300,
        cooldownMs: 1000,
        manaCost: 0,
        staminaCost: 0,
        maxLevel: 5,
        basicAttack: true,
        levelConfig: basicAttackLevels(),
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
        // basic_attack = Archer_Attack01 (9 frame = 750 ms), mũi tên rời cung ở frame 6 (500 ms).
        code: "archer_basic_attack",
        skillType: SkillType.PROJECTILE,
        targetType: TargetType.TARGET,
        castRange: 5,
        castTimeMs: 750,
        cooldownMs: 1000,
        manaCost: 0,
        staminaCost: 0,
        maxLevel: 5,
        basicAttack: true,
        levelConfig: basicAttackLevels(),
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks: 10,
                shape: HitShape.CIRCLE,
                range: 0,
                radius: 0.15,
                offsetX: 0.3,
                offsetY: 0.3,
                damageScaling: 1,
                delivery: HitDelivery.PROJECTILE,
                projectile: {
                    movementType: ProjectileMovementType.STRAIGHT,
                    hitBehavior: ProjectileHitBehavior.DESTROY,
                    speed: 12,
                    maxDistance: 6,
                    radius: 0.15,
                    maxHits: 1,
                },
            }),
        ],
    },
    {
        // basic_attack = Priest_Attack (9 frame = 750 ms): cột sáng hiện trên mục tiêu ở frame 4 (333 ms),
        // nổ ở frame 6 (500 ms) → đặt vùng ở 350 ms, gây damage sau 150 ms.
        code: "cleric_basic_attack",
        skillType: SkillType.GROUND,
        targetType: TargetType.TARGET,
        castRange: 4,
        castTimeMs: 750,
        cooldownMs: 1000,
        manaCost: 0,
        staminaCost: 0,
        maxLevel: 5,
        basicAttack: true,
        levelConfig: basicAttackLevels(DamageScalingType.MAGIC_ATTACK),
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks: 7,
                shape: HitShape.CIRCLE,
                range: 0,
                radius: 0.6,
                damageScaling: 1.1,
                damageScalingType: DamageScalingType.MAGIC_ATTACK,
                damageType: DamageType.MAGICAL,
                delivery: HitDelivery.AREA,
                area: { delayMs: 150, untargetedDistance: 1.5 },
            }),
        ],
    },
];

/** Đòn đánh thường của Orc, chỉnh tay (monster khác sinh theo hitbox — `monsterAttackSkill`). */
const ORC_SLASH: NewSkill = {
    code: "orc_slash",
    skillType: SkillType.MELEE,
    targetType: TargetType.DIRECTION,
    castRange: 1,
    castTimeMs: 350,
    cooldownMs: 2000,
    manaCost: 0,
    staminaCost: 0,
    maxLevel: 1,
    basicAttack: true,
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
};

const round2 = (value: ReturnType<typeof big>) => bigToNumber(value.decimalPlaces(2));

/**
 * Đòn đánh thường của monster, vùng RECT ước theo hitbox của nó (cùng công thức cho ra đúng
 * `orc_slash` với hitbox Orc 0.4 × 0.5): bắt đầu sau lưng 0.13 ô, vươn trước mặt
 * 0.55 × √(hitbox.width / 0.4) ô; cao 1.4 × hitbox.height + 0.14, tâm ở giữa thân. Monster đánh xa
 * dùng vùng dài 4 ô trước mặt. Trúng đòn ở ~60% clip Attack1. Chỉnh tay bằng WorldColliderDebugView.
 */
const monsterAttackSkill = (monster: MonsterDefinition): NewSkill => {
    const { hitbox } = monster;
    const halfWidth = big(hitbox.width).div(2);
    const offsetX = monster.ranged ? big(0) : halfWidth.plus(0.13).negated();
    const reach = big(0.55).times(big(hitbox.width).div(0.4).sqrt());
    const range = monster.ranged ? big(4) : halfWidth.plus(reach).minus(offsetX);
    const triggerTicks = Math.max(
        1,
        floorBig(big(monster.attackClipMs).times(0.6).times(BASE_SKILL_TICK_RATE).div(1000))
    );
    return {
        code: monsterAttackSkillCode(monster),
        skillType: SkillType.MELEE,
        targetType: TargetType.DIRECTION,
        castRange: round2(range.plus(offsetX)),
        castTimeMs: monster.attackClipMs,
        cooldownMs: 0,
        manaCost: 0,
        staminaCost: 0,
        maxLevel: 1,
        basicAttack: true,
        levelConfig: [level(1, 2, 0.25)],
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks,
                shape: HitShape.RECT,
                range: round2(range),
                width: monster.ranged ? 0.5 : round2(big(hitbox.height).times(1.4).plus(0.14)),
                offsetX: round2(offsetX),
                offsetY: round2(big(hitbox.offsetY ?? 0).minus(monster.ranged ? 0 : 0.02)),
                damageScaling: monster.ranged ? 1 : 1.25,
            }),
        ],
    };
};

const MONSTER_SKILLS: NewSkill[] = MONSTER_DEFINITIONS.filter(
    (monster) => !monster.attackSkillCode
).map(monsterAttackSkill);

export const SkillSeed = async () => {
    for (const skill of [...CLASS_SKILLS, ORC_SLASH, ...MONSTER_SKILLS]) {
        await SkillRepo.upsert({
            data: skill,
            target: Skills.code,
            matchValue: skill.code,
            updateData: skill,
        });
    }

    console.info("✅ [SkillSeed] Done");
};
