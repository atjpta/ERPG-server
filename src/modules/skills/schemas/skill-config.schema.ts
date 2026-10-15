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
 * Đạn của hit event PROJECTILE: sinh ra tại vị trí người đánh, bay thẳng về phía
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
 * mục tiêu → cách người đánh `untargetedDistance` ô theo hướng mặt), dùng `shape`/`radius` của event, gây damage sau `delayMs`.
 */
export const SkillAreaSchema = z.object({
    delayMs: z.number().int().nonnegative().default(0),
    untargetedDistance: nonNegative.default(1),
    /**
     * Vùng tồn tại bao lâu tính từ lúc đặt (ms): lần gây damage đầu sau `delayMs`, rồi cứ mỗi `tickMs` lại gây tiếp cho tới khi hết
     * thời gian này (mưa tên, bãi lửa...). 0 = chỉ một lần sau `delayMs` rồi biến mất.
     */
    durationMs: z.number().int().nonnegative().optional(),
    /** Chu kỳ gây damage (ms) khi `durationMs` > 0; thiếu = 1000. */
    tickMs: z.number().int().positive().optional(),
});

/**
 * Cách một skill lướt tới mục tiêu (kiểu `DASH` khác `dash` thường, xem `isChargeSkill`) di chuyển — chỉnh ở
 * skill seed (`chargeConfig`), thiếu field thì dùng mặc định. Client đọc cùng giá trị qua `skills.json`.
 */
export const SkillChargeSchema = z.object({
    /** Tốc độ lướt (ô / giây); mặc định 8 = tốc độ dash thường. */
    speed: z.number().positive().default(8),
    /** Số tick dư ngoài thời gian lướt vừa đủ tới `castRange`, cho mục tiêu chạy ra xa / bị địa hình cản. */
    graceTicks: z.number().int().nonnegative().default(10),
    /** Không có mục tiêu: lướt theo hướng đang đi quãng này (ô) rồi ra đòn. Thiếu = lướt full tầm, tức đúng `castRange` của skill. */
    freeDistance: nonNegative.optional(),
});

/**
 * Hit event AURA: một vùng elip bám theo người dùng skill, bắt đầu ngay lúc bấm (`triggerTicks` bỏ qua), tồn tại
 * `durationMs` rồi mới tính hồi chiêu `cooldownMs` của skill. Mỗi `tickMs` hồi máu bản thân + đồng đội cùng party trong vùng
 * và gây damage quái trong vùng (hệ số × MAGIC_ATTACK). Level của skill làm vùng to ra và sống lâu hơn — hình vẽ là prefab
 * `Resources/Prefabs/SkillEffects/<code>` phóng theo cùng tỉ lệ, nên `radiusX` / `radiusY` phải khớp prefab ở scale gốc.
 */
export const SkillAuraSchema = z.object({
    /** Thời gian tồn tại ở level 1 (ms) và mỗi level sau cộng thêm. */
    durationMs: z.number().int().positive(),
    durationMsPerLevel: z.number().int().nonnegative().default(0),
    /** Nửa trục (ô) của vùng ở level 1; trục Y thường nhỏ hơn X vì vùng nằm sát đất. */
    radiusX: z.number().positive(),
    radiusY: z.number().positive(),
    /** Mỗi level sau, vùng nở thêm chừng này lần bán kính level 1 (0.1 = +10%). */
    radiusScalePerLevel: nonNegative.default(0),
    /** Chu kỳ gây hiệu ứng (ms). */
    tickMs: z.number().int().positive().default(1000),
    /** Hồi mỗi chu kỳ: hệ số × MAGIC_ATTACK của người dùng; 0 = không hồi. */
    healScaling: nonNegative.default(0),
    /** Damage phép lên quái mỗi chu kỳ: hệ số × MAGIC_ATTACK của người dùng; 0 = không gây. */
    damageScaling: nonNegative.default(0),
});

/**
 * Hit event ALLIES: tại `triggerTicks`, hồi cho người dùng và đồng đội cùng party đứng trong vùng elip quanh người dùng
 * (nửa trục `radiusX` / `radiusY`, ô) `healBase + healScaling × MAGIC_ATTACK` máu. Client hiện "+N" trên đầu mỗi người — kể cả khi
 * đã đầy máu — và gắn prefab `Resources/Prefabs/SkillEffects/<code>` lên từng người được hồi.
 */
export const SkillAlliesSchema = z.object({
    radiusX: z.number().positive(),
    radiusY: z.number().positive(),
    healBase: nonNegative.default(0),
    healScaling: nonNegative.default(0),
});

export const SkillHitEventSchema = z.object({
    eventIndex: z.number().int().nonnegative(),
    triggerTicks: z.number().int().nonnegative().default(0),
    shape: z.enum(HitShape),
    range: nonNegative.default(0),
    width: nonNegative.default(0),
    height: nonNegative.default(0),
    radius: nonNegative.default(0),
    angle: nonNegative.default(90),
    /**
     * HITBOX: vùng đánh xoay theo hướng ngắm — về phía target đang chọn, không có thì theo hướng mặt — thay vì chỉ trái / phải.
     * Hướng chốt lúc bắt đầu skill (`PlayerWorldState.aimX/aimY`); client xoay hiệu ứng theo cùng hướng.
     */
    aimed: z.boolean().optional(),
    /**
     * HITBOX: hit events with the same group are ONE hit drawn frame by frame (each event is the collider of one animation frame):
     * a target is damaged by the first frame whose collider touches it, and the later frames of the group skip it. Events without
     * a group are hits of their own. A skill therefore hits a target once per group (plus once per ungrouped event).
     */
    hitGroup: z.number().int().nonnegative().optional(),
    effects: z.array(SkillEffectSchema).default([]),
    /** Mặc định HITBOX: vùng (shape/offset ở trên) quanh người đánh, nổ ngay tại `triggerTicks`. */
    delivery: z.enum(HitDelivery).default(HitDelivery.HITBOX),
    /** Bắt buộc khi `delivery = PROJECTILE`. */
    projectile: SkillProjectileSchema.optional(),
    /** Bắt buộc khi `delivery = AREA`. */
    area: SkillAreaSchema.optional(),
    /** Bắt buộc khi `delivery = AURA`. */
    aura: SkillAuraSchema.optional(),
    /** Bắt buộc khi `delivery = ALLIES`. */
    allies: SkillAlliesSchema.optional(),
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
export type SkillAura = z.infer<typeof SkillAuraSchema>;
export type SkillAllies = z.infer<typeof SkillAlliesSchema>;
/** Giá trị đã điền mặc định (đầu ra của schema); cột `chargeConfig` chỉ cần khai báo field muốn đổi. */
export type SkillCharge = z.infer<typeof SkillChargeSchema>;
export type SkillChargeInput = z.input<typeof SkillChargeSchema>;
export type SkillConfig = z.infer<typeof SkillConfigSchema>;
