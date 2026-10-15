import { Direction } from "@/modules/player/enums/player.enum.js";
import type { Skill } from "@/modules/skills/entities/skill.entity.js";
import { HitDelivery } from "@/modules/skills/enums/skill.enum.js";
import type { SkillAura, SkillHitEvent } from "@/modules/skills/schemas/skill-config.schema.js";
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
    /** Một bản dùng chung cho mọi hit của đòn: nhóm `hitGroup` → mục tiêu đã trúng (xem `claimGroupHit`). */
    groupHits: Map<number, Set<string>>;
    /** Hướng ngắm của hit event `aimed` (vector đơn vị, toạ độ server); không có thì vùng đánh theo `direction`. */
    aim?: { x: number; y: number };
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
    scale = 1,
    aim?: { x: number; y: number }
): PendingSkillHit[] {
    const castTicks = getSkillCastTicks(skill, tickRate);
    const groupHits = new Map<number, Set<string>>();
    return (
        skill.skillHitEvents
            .map((event, eventIndex) => ({
                skill,
                event: scaleSkillHitEvent(event, scale),
                attackSerial,
                eventIndex,
                // `triggerTicks` tính từ lúc anim bắt đầu, tức sau thời gian chờ `castTimeMs`.
                ticksUntilHit: castTicks + skillEventTicks(event.triggerTicks, tickRate),
                direction,
                groupHits,
                ...(event.aimed && aim && { aim }),
            }))
            // Vùng buff (AURA) bắt đầu ngay lúc bấm (startAura), không chờ lịch hit.
            .filter((hit) => hit.event.delivery !== HitDelivery.AURA)
    );
}

/**
 * Mục tiêu có được hit event này tính hay không: hit không có `hitGroup` luôn tính; hit trong một nhóm chỉ tính cho mục tiêu
 * chưa trúng frame nào của nhóm (rồi ghi nhớ nó) — các frame sau của nhóm bỏ qua mục tiêu đã trúng.
 */
export function claimGroupHit(
    hit: Pick<PendingSkillHit, "event" | "groupHits">,
    targetId: string
): boolean {
    const group = hit.event.hitGroup;
    if (group === undefined) return true;
    let hitTargets = hit.groupHits.get(group);
    if (!hitTargets) {
        hitTargets = new Set();
        hit.groupHits.set(group, hitTargets);
    }
    if (hitTargets.has(targetId)) return false;
    hitTargets.add(targetId);
    return true;
}

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

/** Giảm 1 tick cho mọi hit đang chờ, gọi `onHit` cho hit đến lượt và bỏ nó khỏi danh sách. */
export function tickPendingSkillHits(
    hits: PendingSkillHit[],
    onHit: (hit: PendingSkillHit) => void
): void {
    for (let index = hits.length - 1; index >= 0; index--) {
        const hit = hits[index];
        hit.ticksUntilHit--;
        if (hit.ticksUntilHit > 0) continue;

        // Hit hồi đồng đội (ALLIES) không có damage nhưng vẫn phải được giao.
        if (hasDamageEffect(hit.event) || hit.event.delivery === HitDelivery.ALLIES) onHit(hit);
        hits.splice(index, 1);
    }
}
