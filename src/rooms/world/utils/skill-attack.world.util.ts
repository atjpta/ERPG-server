import { Direction } from "@/modules/player/enums/player.enum.js";
import type { Skill } from "@/modules/skills/entities/skill.entity.js";
import { DamageScalingType, SkillEffectType } from "@/modules/skills/enums/skill.enum.js";
import type { SkillHitEvent } from "@/modules/skills/schemas/skill-config.schema.js";
import { millisecondsToTicks, skillEventTicks } from "@/rooms/world/utils/tick.world.util.js";

export type HorizontalDirection = Direction.LEFT | Direction.RIGHT;

export interface PendingSkillHit {
    event: SkillHitEvent;
    ticksUntilHit: number;
    rawDamage: number;
    direction: HorizontalDirection;
}

export const toHorizontalDirection = (direction: string): HorizontalDirection =>
    direction === Direction.LEFT ? Direction.LEFT : Direction.RIGHT;

export function getSkillHitDamage(attack: number, event: SkillHitEvent): number {
    return event.effects
        .filter((effect) => effect.effectType === SkillEffectType.DAMAGE)
        .reduce((total, effect) => {
            const scaledStat = effect.scalingType === DamageScalingType.ATTACK ? attack : 0;
            return total + effect.baseValue + scaledStat * effect.scalingValue;
        }, 0);
}

/** Lên lịch mọi hit event của skill; phần damage lẻ dồn sang hit sau để tổng không bị hụt. */
export function buildPendingSkillHits(
    skill: Skill,
    attack: number,
    direction: HorizontalDirection,
    tickRate: number
): PendingSkillHit[] {
    let damageRemainder = 0;
    return skill.skillHitEvents.map((event) => {
        const exactDamage = getSkillHitDamage(attack, event);
        let rawDamage = 0;
        if (exactDamage > 0) {
            const accumulatedDamage = exactDamage + damageRemainder;
            rawDamage = Math.floor(accumulatedDamage);
            damageRemainder = accumulatedDamage - rawDamage;
        }
        return {
            event,
            ticksUntilHit: skillEventTicks(event.triggerTicks, tickRate),
            rawDamage,
            direction,
        };
    });
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

        if (hit.rawDamage > 0) onHit(hit);
        hits.splice(index, 1);
    }
}
