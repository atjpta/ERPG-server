import { Direction } from "@/modules/player/enums/player.enum.js";
import type { Skill } from "@/modules/skills/entities/skill.entity.js";
import type { SkillHitEvent } from "@/modules/skills/schemas/skill-config.schema.js";
import { hasDamageEffect } from "@/rooms/world/chains/damage.world.chain.js";
import { millisecondsToTicks, skillEventTicks } from "@/rooms/world/utils/tick.world.util.js";

export type HorizontalDirection = Direction.LEFT | Direction.RIGHT;

export interface PendingSkillHit {
    event: SkillHitEvent;
    /** Số thứ tự đòn của bên đánh + thứ tự trong `skill.skillHitEvents` — ghép thành seed roll combat. */
    attackSerial: number;
    eventIndex: number;
    ticksUntilHit: number;
    direction: HorizontalDirection;
}

export const toHorizontalDirection = (direction: string): HorizontalDirection =>
    direction === Direction.LEFT ? Direction.LEFT : Direction.RIGHT;

/** Lên lịch mọi hit event của skill; damage tính lúc hit nổ (`calculateDamage`). */
export function buildPendingSkillHits(
    skill: Skill,
    attackSerial: number,
    direction: HorizontalDirection,
    tickRate: number
): PendingSkillHit[] {
    return skill.skillHitEvents.map((event, eventIndex) => ({
        event,
        attackSerial,
        eventIndex,
        ticksUntilHit: skillEventTicks(event.triggerTicks, tickRate),
        direction,
    }));
}

/** Số tick tối thiểu của skill: đủ cast time và đủ để hit event cuối cùng nổ. */
export const getSkillDurationTicks = (skill: Skill, tickRate: number) =>
    Math.max(
        millisecondsToTicks(skill.castTimeMs, tickRate),
        ...skill.skillHitEvents.map((event) => skillEventTicks(event.triggerTicks, tickRate))
    );

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
