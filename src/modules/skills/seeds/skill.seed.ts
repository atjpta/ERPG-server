import { Skills, type NewSkill } from "@/modules/skills/entities/skill.entity.js";
import { skillClipWarnings } from "@/modules/bodies/utils/anim-clip.util.js";
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
    StatusEffectType,
    SkillType,
    TargetType,
} from "@/modules/skills/enums/skill.enum.js";
import { SkillRepo } from "@/modules/skills/repositories/skill.repository.js";
import { DASH_SKILL_CODE } from "@/modules/skills/services/skill.service.js";
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

const stun = (durationMs: number) => ({
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
const knockback = (distance: number, durationMs: number) => ({
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

const hitEvent = (params: {
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
    level(6, 0, 1.6, scalingType),
    level(7, 0, 1.7, scalingType),
    level(8, 0, 1.8, scalingType),
    level(9, 0, 1.9, scalingType),
    level(10, 0, 2, scalingType),
];

/**
 * Đòn đánh thường (`basicAttack`) của 3 class khởi đầu, canh theo anim trong
 * `Assets/ERPG/Animation/PackCharacters/<Class>` (12 fps × speed của state trong controller).
 * `castTimeMs` = chờ trước khi anim chạy (khoá di chuyển); `animationMs` = thời lượng anim (khoá di chuyển), luôn ≥ lúc gây damage cuối + 150 ms (hit event tính từ lúc anim bắt đầu).
 */
const CLASS_SKILLS: NewSkill[] = [
    {
        // Dash của mọi class: lướt `animationMs` (khoá di chuyển, huỷ đòn đang dở), rồi `cooldownMs` mới lướt lại.
        // PlayerWorldState.chainDash và client (WorldMovementStep) đọc hai số này — đổi ở đây rồi `yarn seed --force` + `yarn config:export`.
        code: DASH_SKILL_CODE,
        skillType: SkillType.DASH,
        targetType: TargetType.DIRECTION,
        castRange: 0,
        castTimeMs: 0,
        animationMs: 300,
        cooldownMs: 3000,
        manaCost: 0,
        staminaCost: 0,
        maxLevel: 1,
        basicAttack: false,
        levelConfig: [],
        skillHitEvents: [],
    },
    {
        // basic_attack (clip Attack1 cũ, speed 2, 7 frame = 292 ms), chém ở frame 3. Cần thêm đòn thì thêm skill + clip sau.
        code: "swordsman_basic_attack",
        skillType: SkillType.MELEE,
        targetType: TargetType.DIRECTION,
        castRange: 1.2,
        castTimeMs: 0,
        animationMs: 500,
        cooldownMs: 0,
        manaCost: 0,
        staminaCost: 0,
        maxLevel: 10,
        basicAttack: true,
        levelConfig: basicAttackLevels(),
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks: 3,
                shape: HitShape.RECT,
                range: 0.87,
                width: 0.56,
                damageScaling: 1,
            }),
        ],
    },
    {
        // basic_attack = Archer_Attack01 (9 frame = 750 ms), mũi tên rời cung ở frame 6 (500 ms).
        code: "archer_basic_attack",
        skillType: SkillType.PROJECTILE,
        targetType: TargetType.TARGET,
        castRange: 4,
        castTimeMs: 0,
        animationMs: 660,
        cooldownMs: 1000,
        manaCost: 0,
        staminaCost: 0,
        maxLevel: 10,
        basicAttack: true,
        levelConfig: basicAttackLevels(),
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks: 6,
                shape: HitShape.CIRCLE,
                range: 0,
                radius: 0.15,
                damageScaling: 1,
                delivery: HitDelivery.PROJECTILE,
                projectile: {
                    movementType: ProjectileMovementType.STRAIGHT,
                    hitBehavior: ProjectileHitBehavior.DESTROY,
                    speed: 12,
                    maxDistance: 5,
                    radius: 0.15,
                    maxHits: 1,
                },
            }),
        ],
    },
    {
        // Anim piercing_arrow (12 frame, 12 fps = 1000 ms): mũi tên rời cung ở frame 9 (750 ms) → tick 15. Mũi tên xuyên qua mọi
        // mục tiêu trên đường bay (PIERCE, mỗi con trúng 1 lần); prefab hiệu ứng `archer_piercing_arrow`.
        code: "archer_piercing_arrow",
        skillType: SkillType.PROJECTILE,
        targetType: TargetType.TARGET,
        castRange: 8,
        castTimeMs: 0,
        animationMs: 1000,
        cooldownMs: 3000,
        manaCost: 6,
        staminaCost: 0,
        maxLevel: 10,
        basicAttack: false,
        levelConfig: basicAttackLevels(DamageScalingType.ATTACK),
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks: 15,
                shape: HitShape.CIRCLE,
                range: 0,
                radius: 0.3,
                damageScaling: 2,
                delivery: HitDelivery.PROJECTILE,
                projectile: {
                    movementType: ProjectileMovementType.STRAIGHT,
                    hitBehavior: ProjectileHitBehavior.PIERCE,
                    speed: 14,
                    maxDistance: 8,
                    radius: 0.3,
                    maxHits: 10,
                },
            }),
        ],
    },
    {
        // Anim knockback_shot (cùng sheet Archer_Attack02, 12 frame = 1000 ms): mũi tên rời cung ở frame 9 (750 ms) → tick 15.
        // Trúng thì đẩy lùi mục tiêu 2.5 ô ra xa người bắn trong 300 ms (mục tiêu choáng suốt lúc bị đẩy); prefab `archer_knockback_shot`.
        code: "archer_knockback_shot",
        skillType: SkillType.PROJECTILE,
        targetType: TargetType.TARGET,
        castRange: 7,
        castTimeMs: 0,
        animationMs: 1000,
        cooldownMs: 4000,
        manaCost: 5,
        staminaCost: 0,
        maxLevel: 10,
        basicAttack: false,
        levelConfig: basicAttackLevels(DamageScalingType.ATTACK),
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks: 15,
                shape: HitShape.CIRCLE,
                range: 0,
                radius: 0.3,
                damageScaling: 1.2,
                knockback: { distance: 2.5, durationMs: 300 },
                delivery: HitDelivery.PROJECTILE,
                projectile: {
                    movementType: ProjectileMovementType.STRAIGHT,
                    hitBehavior: ProjectileHitBehavior.DESTROY,
                    speed: 14,
                    maxDistance: 7,
                    radius: 0.3,
                    maxHits: 1,
                },
            }),
        ],
    },
    {
        // Anim rain_arrows (cùng sheet Archer_Attack01, 9 frame = 750 ms): bắn lên trời ở frame 6 (500 ms) → tick 10. Vùng đặt ở chỗ
        // mục tiêu (hoặc 3 ô phía trước nếu không có) và tồn tại `durationMs`: ParticleSystem trong prefab `archer_rain_arrows`
        // (chỉnh ở Inspector, loop tới khi vùng hết) rơi mưa tên, còn damage gây lặp mỗi `tickMs` lên mọi quái trong vòng đỏ.
        // Vòng đỏ = width × height.
        code: "archer_rain_arrows",
        skillType: SkillType.AOE,
        targetType: TargetType.TARGET,
        castRange: 7,
        castTimeMs: 0,
        animationMs: 750,
        cooldownMs: 8000,
        manaCost: 10,
        staminaCost: 0,
        maxLevel: 10,
        basicAttack: false,
        levelConfig: basicAttackLevels(DamageScalingType.ATTACK),
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks: 10,
                shape: HitShape.ELLIPSE,
                range: 0,
                width: 3,
                height: 1.5,
                damageScaling: 0.5, // mỗi lần mưa trúng
                delivery: HitDelivery.AREA,
                // Mưa kéo dài 4 s: lần trúng đầu sau 0.4 s (mũi tên đầu chạm đất), rồi mỗi 0.5 s → 8 lần.
                area: { delayMs: 400, untargetedDistance: 3, durationMs: 4000, tickMs: 500 },
            }),
        ],
    },
    {
        // basic_attack = Priest_Attack (9 frame = 750 ms): cột sáng hiện trên mục tiêu ở frame 4 (333 ms),
        // nổ ở frame 6 (500 ms) → đặt vùng ở 350 ms, gây damage sau 150 ms.
        code: "cleric_basic_attack",
        skillType: SkillType.GROUND,
        targetType: TargetType.TARGET,
        castRange: 3,
        castTimeMs: 0,
        animationMs: 500,
        cooldownMs: 1000,
        manaCost: 0,
        staminaCost: 0,
        maxLevel: 10,
        basicAttack: true,
        levelConfig: basicAttackLevels(DamageScalingType.MAGIC_ATTACK),
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks: 4,
                shape: HitShape.ELLIPSE,
                range: 0,
                width: 1,
                height: 0.3,
                damageScaling: 1,
                damageScalingType: DamageScalingType.MAGIC_ATTACK,
                damageType: DamageType.MAGICAL,
                delivery: HitDelivery.AREA,
                area: { delayMs: 300, untargetedDistance: 2 },
            }),
        ],
    },
    {
        // Skill chủ động số 2: anim cross_slash (10 frame thân + object con SkillEffect, 12 fps, clip 833 ms), sheet Cross_Slash 160×99 px (32 px = 1 tile).
        // Nhát 1 = vệt chém dọc của thân ở 417 ms (sprite Attack02_3) → tick 8.
        // Nhát 2 = sóng chém SkillEffect ở 583 ms (frame Cross_Slash_2, scale 0.75 × 0.5 → 3.75 × 1.55 tile, tâm lệch (0.5, 0.25)):
        //   vệt phủ x từ -0.09 tới 2.36, y từ -0.52 tới 1.02 → tick 12 (khớp 600 ms). Đổi scale / vị trí SkillEffect trong clip thì tính lại vùng này.
        // Vùng đánh xoay theo hướng ngắm (về phía target đang chọn, mọi hướng): `aimed`.
        // Cả hai nhát đều làm choáng mục tiêu 2 s (đứng im, giữ nguyên anim đang chạy, hết choáng thì về idle).
        // `cooldownMs` đếm từ lúc bắt đầu skill, riêng với hồi đòn đánh thường.
        code: "swordsman_cross_slash",
        skillType: SkillType.MELEE,
        targetType: TargetType.DIRECTION,
        castRange: 1.6,
        castTimeMs: 0,
        animationMs: 750,
        cooldownMs: 2000,
        manaCost: 0,
        staminaCost: 0,
        maxLevel: 10,
        basicAttack: false,
        levelConfig: basicAttackLevels(DamageScalingType.ATTACK),
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks: 4,
                shape: HitShape.RECT,
                range: 1.6,
                width: 2,
                damageScaling: 0.8,
                stunMs: 2000,
                aimed: true,
            }),
            hitEvent({
                eventIndex: 1,
                triggerTicks: 5,
                shape: HitShape.RECT,
                range: 1.6,
                width: 2,
                damageScaling: 0.8,
                stunMs: 2000,
                aimed: true,
            }),
        ],
    },
    {
        code: "swordsman_slash_dash",
        skillType: SkillType.DASH,
        targetType: TargetType.TARGET,
        castRange: 4,
        castTimeMs: 0,
        animationMs: 300,
        cooldownMs: 2000,
        manaCost: 0,
        staminaCost: 0,
        maxLevel: 10,
        basicAttack: false,
        chargeConfig: { speed: 12, graceTicks: 10 }, // không có mục tiêu: lướt full `castRange`
        levelConfig: basicAttackLevels(DamageScalingType.ATTACK),
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks: 2,
                shape: HitShape.RECT,
                range: 1.5,
                width: 2,
                height: 2,
                damageScaling: 1.2,
            }),
        ],
    },
    {
        code: "swordsman_fly_slash",
        skillType: SkillType.PROJECTILE,
        targetType: TargetType.TARGET,
        castRange: 6,
        castTimeMs: 0,
        animationMs: 500,
        cooldownMs: 2000,
        manaCost: 0,
        staminaCost: 0,
        maxLevel: 10,
        basicAttack: false,
        levelConfig: basicAttackLevels(DamageScalingType.ATTACK),
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks: 3,
                shape: HitShape.CIRCLE,
                range: 0,
                radius: 0.6,
                damageScaling: 1.5,
                delivery: HitDelivery.PROJECTILE,
                projectile: {
                    movementType: ProjectileMovementType.STRAIGHT,
                    hitBehavior: ProjectileHitBehavior.PIERCE,
                    speed: 12,
                    maxDistance: 6,
                    radius: 0.6,
                    maxHits: 10,
                },
            }),
        ],
    },
    {
        code: "cleric_fireball",
        skillType: SkillType.PROJECTILE,
        targetType: TargetType.TARGET,
        castRange: 7,
        castTimeMs: 0,
        animationMs: 500,
        cooldownMs: 2000,
        manaCost: 8,
        staminaCost: 0,
        maxLevel: 10,
        basicAttack: false,
        levelConfig: basicAttackLevels(DamageScalingType.MAGIC_ATTACK),
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks: 4,
                shape: HitShape.CIRCLE,
                range: 0,
                radius: 0.4,
                damageScaling: 2.2,
                damageScalingType: DamageScalingType.MAGIC_ATTACK,
                damageType: DamageType.MAGICAL,
                delivery: HitDelivery.PROJECTILE,
                projectile: {
                    movementType: ProjectileMovementType.STRAIGHT,
                    hitBehavior: ProjectileHitBehavior.DESTROY,
                    speed: 9,
                    maxDistance: 7,
                    radius: 0.4,
                    maxHits: 1,
                },
            }),
        ],
    },
    {
        // Trong lúc niệm client giữ frame đầu của anim vụ nổ (key 0 của clip phải là sprite đầu tiên) ở chỗ mục tiêu, niệm xong mới chạy tiếp.
        code: "cleric_explosion",
        skillType: SkillType.AOE,
        targetType: TargetType.TARGET,
        castRange: 6,
        castTimeMs: 1000,
        animationMs: 300,
        cooldownMs: 2000,
        manaCost: 0,
        staminaCost: 0,
        maxLevel: 10,
        basicAttack: false,
        levelConfig: basicAttackLevels(DamageScalingType.MAGIC_ATTACK),
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks: 3,
                shape: HitShape.ELLIPSE,
                range: 0,
                width: 2,
                height: 1,
                damageScaling: 3,
                damageScalingType: DamageScalingType.MAGIC_ATTACK,
                damageType: DamageType.MAGICAL,
                delivery: HitDelivery.AREA,
                area: { delayMs: 500, untargetedDistance: 3 },
            }),
        ],
    },
    {
        code: "cleric_buff_hp",
        skillType: SkillType.HEAL,
        targetType: TargetType.SELF,
        castRange: 0,
        castTimeMs: 0,
        animationMs: 500,
        cooldownMs: 2000,
        manaCost: 0,
        staminaCost: 0,
        maxLevel: 10,
        basicAttack: false,
        levelConfig: [],
        skillHitEvents: [
            {
                eventIndex: 0,
                triggerTicks: 3,
                shape: HitShape.ELLIPSE,
                range: 0,
                width: 5,
                height: 3.6,
                radius: 0,
                angle: 90,
                effects: [],
                delivery: HitDelivery.ALLIES,
                allies: { radiusX: 4, radiusY: 3, healScaling: 3, healBase: 0 },
            },
        ],
    },
];

const round2 = (value: ReturnType<typeof big>) => bigToNumber(value.decimalPlaces(2));

/**
 * Đòn đánh thường của monster, vùng RECT ước theo hitbox của nó (hitbox 0.4 × 0.5 cho vùng 1.08 × 0.84): bắt đầu sau lưng 0.13 ô, vươn trước mặt
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
        castTimeMs: 0,
        animationMs: monster.attackClipMs,
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
                range: round2(range.plus(offsetX)),
                width: monster.ranged ? 0.5 : round2(big(hitbox.height).times(1.4).plus(0.14)),
                damageScaling: monster.ranged ? 1 : 1.25,
            }),
        ],
    };
};

const MONSTER_SKILLS: NewSkill[] = MONSTER_DEFINITIONS.filter(
    (monster) => !monster.attackSkillCode && !monster.noAttack
).map(monsterAttackSkill);

/** Skill đã bỏ: tắt (`enabled = false`) chứ không xoá, để dữ liệu cũ còn tra được. ClassSeed gán lại bộ skill mặc định cho player. */
const RETIRED_SKILL_CODES = [
    "swordsman_triple_strike",
    "swordsman_shockwave_slash",
    "cleric_aura_buff",
];

export const SkillSeed = async () => {
    for (const skill of [...CLASS_SKILLS, ...MONSTER_SKILLS]) {
        await SkillRepo.upsert({
            data: skill,
            target: Skills.code,
            matchValue: skill.code,
            updateData: skill,
        });
    }

    for (const code of RETIRED_SKILL_CODES) {
        const retired = await SkillRepo.findByCode({ code });
        if (retired?.enabled)
            await SkillRepo.updateById({ id: retired.id, data: { enabled: false } });
    }

    // Class skills are tuned by hand, but must not outlast the Unity clip they play.
    const timed = CLASS_SKILLS.map((skill) => ({
        code: skill.code,
        animationMs: skill.animationMs ?? 0,
        castTimeMs: skill.castTimeMs ?? 0,
        skillHitEvents: skill.skillHitEvents ?? [],
    }));
    for (const warning of skillClipWarnings(timed)) console.warn(`⚠️ [SkillSeed] ${warning}`);

    console.info("✅ [SkillSeed] Done");
};
