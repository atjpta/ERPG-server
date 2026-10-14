import { Direction } from "@/modules/player/enums/player.enum.js";
import type { Skill } from "@/modules/skills/entities/skill.entity.js";
import { HitDelivery } from "@/modules/skills/enums/skill.enum.js";
import type { SkillHitEvent } from "@/modules/skills/schemas/skill-config.schema.js";
import { hasDamageEffect } from "@/rooms/world/chains/damage.world.chain.js";
import type { HitboxColliderState } from "@/rooms/world/schema/hitbox-collider.world.state.js";
import { intersectsSkillHitEvent } from "@/rooms/world/utils/skill-hitbox.world.util.js";
import { millisecondsToTicks, skillEventTicks } from "@/rooms/world/utils/tick.world.util.js";

export type HorizontalDirection = Direction.LEFT | Direction.RIGHT;

export interface PendingSkillHit {
    skill: Skill;
    event: SkillHitEvent;
    /** Số thứ tự đòn của bên đánh + thứ tự trong `skill.skillHitEvents` — ghép thành seed roll combat. */
    attackSerial: number;
    eventIndex: number;
    ticksUntilHit: number;
    direction: HorizontalDirection;
}

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
          };

/**
 * Lên lịch mọi hit event của skill (vùng đánh nhân `scale` — monster elite/boss to hơn); damage tính
 * lúc hit nổ (`calculateDamage`).
 */
export function buildPendingSkillHits(
    skill: Skill,
    attackSerial: number,
    direction: HorizontalDirection,
    tickRate: number,
    scale = 1
): PendingSkillHit[] {
    const castTicks = getSkillCastTicks(skill, tickRate);
    return skill.skillHitEvents.map((event, eventIndex) => ({
        skill,
        event: scaleSkillHitEvent(event, scale),
        attackSerial,
        eventIndex,
        // `triggerTicks` tính từ lúc anim bắt đầu, tức sau thời gian chờ `castTimeMs`.
        ticksUntilHit: castTicks + skillEventTicks(event.triggerTicks, tickRate),
        direction,
    }));
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

/** Giảm 1 tick cho mọi hit đang chờ, gọi `onHit` cho hit đến lượt và bỏ nó khỏi danh sách. */
export function tickPendingSkillHits(
    hits: PendingSkillHit[],
    onHit: (hit: PendingSkillHit) => void
): void {
    for (let index = hits.length - 1; index >= 0; index--) {
        const hit = hits[index];
        hit.ticksUntilHit--;
        if (hit.ticksUntilHit > 0) continue;

        if (hasDamageEffect(hit.event)) onHit(hit);
        hits.splice(index, 1);
    }
}
