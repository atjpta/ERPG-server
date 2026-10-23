import { Direction } from "@/modules/player/enums/player.enum.js";
import type { Skill } from "@/modules/skills/entities/skill.entity.js";
import { HitDelivery } from "@/modules/skills/enums/skill.enum.js";
import type { SkillAura, SkillHitEvent } from "@/modules/skills/schemas/skill-config.schema.js";
import type { HitboxColliderState } from "@/modules/combat/state/hitbox-collider.state.js";
import { intersectsSkillHitEvent } from "@/modules/combat/utils/skill-hitbox.util.js";
import { millisecondsToTicks, skillEventTicks } from "@/modules/world/utils/tick.util.js";

export type HorizontalDirection = Direction.LEFT | Direction.RIGHT;

export const toHorizontalDirection = (direction: string): HorizontalDirection =>
    direction === Direction.LEFT ? Direction.LEFT : Direction.RIGHT;

/** Vùng đánh của hit event phóng theo kích thước bên đánh (góc ARC giữ nguyên). */
export const scaleSkillHitEvent = (event: SkillHitEvent, scale: number): SkillHitEvent =>
    scale === 1
        ? event
        : {
              ...event,
              range: event.range * scale,
              width: event.width * scale,
              height: event.height * scale,
              radius: event.radius * scale,
              ...(event.offsetX && { offsetX: event.offsetX * scale }),
              ...(event.offsetY && { offsetY: event.offsetY * scale }),
          };

/** Hit event AURA đầu tiên của skill (cùng chỉ số trong `skillHitEvents`); skill thường không có. */
export function getAuraEvent(skill: Pick<Skill, "skillHitEvents">) {
    const eventIndex = skill.skillHitEvents.findIndex(
        (event) => event.delivery === HitDelivery.AURA && event.aura
    );
    if (eventIndex < 0) return undefined;
    const event = skill.skillHitEvents[eventIndex];
    return { event, eventIndex, aura: event.aura as SkillAura };
}

/** Thời gian tồn tại (tick) của vùng buff ở `level` (từ 1). Client C# (SkillConfig.AuraDurationTicks) tính y hệt. */
export const getAuraDurationTicks = (aura: SkillAura, level: number, tickRate: number) =>
    millisecondsToTicks(
        aura.durationMs + aura.durationMsPerLevel * (Math.max(1, level) - 1),
        tickRate
    );

/** Nửa trục (ô) của vùng buff ở `level`: bán kính level 1 nở thêm `radiusScalePerLevel` mỗi level sau. */
export const getAuraRadii = (aura: SkillAura, level: number) => {
    const scale = 1 + aura.radiusScalePerLevel * (Math.max(1, level) - 1);
    return { radiusX: aura.radiusX * scale, radiusY: aura.radiusY * scale };
};

/**
 * Số tick tới khi dùng lại được skill chủ động, đếm từ lúc bấm: chờ `castTimeMs`, rồi (skill AURA) thời gian buff tồn tại —
 * hồi chiêu chỉ chạy sau khi buff hết — rồi `cooldownMs`. 0 = không hồi.
 */
export function getSkillCooldownTicks(skill: Skill, level: number, tickRate: number): number {
    const cooldown = skill.cooldownMs > 0 ? millisecondsToTicks(skill.cooldownMs, tickRate) : 0;
    const aura = getAuraEvent(skill)?.aura;
    if (aura)
        return (
            getSkillCastTicks(skill, tickRate) +
            getAuraDurationTicks(aura, level, tickRate) +
            cooldown
        );
    return cooldown > 0 ? getSkillCastTicks(skill, tickRate) + cooldown : 0;
}

/** Số tick chờ từ lúc bấm đến lúc anim bắt đầu (`castTimeMs`; 0 = anim chạy ngay). */
export const getSkillCastTicks = (skill: Skill, tickRate: number) =>
    skill.castTimeMs > 0 ? millisecondsToTicks(skill.castTimeMs, tickRate) : 0;

/**
 * Tổng số tick khoá di chuyển của skill: thời gian chờ cộng thời gian anim (`animationMs`), anim tối thiểu
 * đủ để hit event cuối cùng nổ.
 */
export const getSkillDurationTicks = (skill: Skill, tickRate: number) =>
    getSkillCastTicks(skill, tickRate) +
    Math.max(
        millisecondsToTicks(skill.animationMs, tickRate),
        ...skill.skillHitEvents.map((event) => skillEventTicks(event.triggerTicks, tickRate))
    );

/**
 * Skill đã với tới mục tiêu khi bên đánh đứng ở `origin` quay về phía nó: một hit event HITBOX chạm
 * hitbox mục tiêu, hoặc (PROJECTILE / AREA) mục tiêu trong `castRange × scale`.
 * Khớp SkillAttackWorldUtil.ReachesTarget bên client.
 */
export function skillReachesTarget(
    skill: Skill,
    origin: { x: number; y: number; direction: string },
    target: { x: number; y: number; hitbox: HitboxColliderState },
    scale = 1
): boolean {
    const castRangeSquared = (skill.castRange * scale) ** 2;
    return skill.skillHitEvents.some((event) =>
        (event.delivery ?? HitDelivery.HITBOX) === HitDelivery.HITBOX
            ? intersectsSkillHitEvent(
                  origin,
                  target.x,
                  target.y,
                  target.hitbox,
                  scaleSkillHitEvent(event, scale)
              )
            : (target.x - origin.x) ** 2 + (target.y - origin.y) ** 2 <= castRangeSquared
    );
}
