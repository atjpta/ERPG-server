import { hasDamageEffect } from "@/modules/combat/chains/damage.chain.js";
import {
    getSkillCastTicks,
    scaleSkillHitEvent,
    type HorizontalDirection,
} from "@/modules/combat/utils/skill-attack.util.js";
import type { Skill } from "@/modules/skills/entities/skill.entity.js";
import { HitDelivery } from "@/modules/skills/enums/skill.enum.js";
import type { SkillHitEvent } from "@/modules/skills/schemas/skill-config.schema.js";
import { skillEventTicks } from "@/modules/world/utils/tick.util.js";

export interface PendingSkillHitProps {
    skill: Skill;
    event: SkillHitEvent;
    attackSerial: number;
    eventIndex: number;
    ticksUntilHit: number;
    direction: HorizontalDirection;
    groupHits: Map<number, Set<string>>;
    aim?: { x: number; y: number };
}

/** Một hit event của skill đang chờ nổ (đếm ngược `ticksUntilHit`); damage tính lúc nổ (`calculateDamage`). */
export class PendingSkillHitState {
    readonly skill: Skill;
    readonly event: SkillHitEvent;
    /** Số thứ tự đòn của bên đánh + thứ tự trong `skill.skillHitEvents` — ghép thành seed roll combat. */
    readonly attackSerial: number;
    readonly eventIndex: number;
    ticksUntilHit: number;
    readonly direction: HorizontalDirection;
    /** Một bản dùng chung cho mọi hit của đòn: nhóm `hitGroup` → mục tiêu đã trúng (xem `claimGroupHit`). */
    readonly groupHits: Map<number, Set<string>>;
    /** Hướng ngắm của hit event `aimed` (vector đơn vị, toạ độ server); không có thì vùng đánh theo `direction`. */
    readonly aim?: { x: number; y: number };

    constructor(props: PendingSkillHitProps) {
        this.skill = props.skill;
        this.event = props.event;
        this.attackSerial = props.attackSerial;
        this.eventIndex = props.eventIndex;
        this.ticksUntilHit = props.ticksUntilHit;
        this.direction = props.direction;
        this.groupHits = props.groupHits;
        this.aim = props.aim;
    }

    /**
     * Lên lịch mọi hit event của skill (vùng đánh nhân `scale` — monster elite/boss to hơn); damage tính
     * lúc hit nổ (`calculateDamage`).
     */
    static schedule(
        skill: Skill,
        attackSerial: number,
        direction: HorizontalDirection,
        tickRate: number,
        scale = 1,
        aim?: { x: number; y: number }
    ): PendingSkillHitState[] {
        const castTicks = getSkillCastTicks(skill, tickRate);
        const groupHits = new Map<number, Set<string>>();
        return (
            skill.skillHitEvents
                .map(
                    (event, eventIndex) =>
                        new PendingSkillHitState({
                            skill,
                            event: scaleSkillHitEvent(event, scale),
                            attackSerial,
                            eventIndex,
                            // `triggerTicks` tính từ lúc anim bắt đầu, tức sau thời gian chờ `castTimeMs`.
                            ticksUntilHit:
                                castTicks + skillEventTicks(event.triggerTicks, tickRate),
                            direction,
                            groupHits,
                            ...(event.aimed && aim && { aim }),
                        })
                )
                // Vùng buff (AURA) bắt đầu ngay lúc bấm (startAura), không chờ lịch hit.
                .filter((hit) => hit.event.delivery !== HitDelivery.AURA)
        );
    }

    /** Giảm 1 tick cho mọi hit đang chờ, gọi `onHit` cho hit đến lượt và bỏ nó khỏi danh sách. */
    static tickAll(hits: PendingSkillHitState[], onHit: (hit: PendingSkillHitState) => void): void {
        for (let index = hits.length - 1; index >= 0; index--) {
            const hit = hits[index];
            if (!hit.tick()) continue;
            // Hit hồi đồng đội (ALLIES) không có damage nhưng vẫn phải được giao.
            if (hit.isDeliverable) onHit(hit);
            hits.splice(index, 1);
        }
    }

    /** Giảm 1 tick; `true` khi tới lượt nổ. */
    tick(): boolean {
        this.ticksUntilHit--;
        return this.ticksUntilHit <= 0;
    }

    get isDeliverable(): boolean {
        return hasDamageEffect(this.event) || this.event.delivery === HitDelivery.ALLIES;
    }

    /**
     * Mục tiêu có được hit event này tính hay không: hit không có `hitGroup` luôn tính; hit trong một nhóm chỉ tính cho mục tiêu
     * chưa trúng frame nào của nhóm (rồi ghi nhớ nó) — các frame sau của nhóm bỏ qua mục tiêu đã trúng.
     */
    claimGroupHit(targetId: string): boolean {
        const group = this.event.hitGroup;
        if (group === undefined) return true;
        let hitTargets = this.groupHits.get(group);
        if (!hitTargets) {
            hitTargets = new Set();
            this.groupHits.set(group, hitTargets);
        }
        if (hitTargets.has(targetId)) return false;
        hitTargets.add(targetId);
        return true;
    }
}
