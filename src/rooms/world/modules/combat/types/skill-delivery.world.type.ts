import type { Skill } from "@/modules/skills/entities/skill.entity.js";
import type { PendingSkillHitState } from "@/modules/combat/state/pending-skill-hit.state.js";
import type { SkillOwner, SkillTarget } from "@/modules/combat/types/skill-owner.type.js";

export interface SkillDeliveryParams {
    owner: SkillOwner;
    skill: Skill;
    hit: PendingSkillHitState;
    /** Vị trí bên đánh lúc hit nổ (chân nhân vật, toạ độ server). */
    originX: number;
    originY: number;
    /** Mục tiêu để ngắm (PROJECTILE) / đặt vùng (AREA); không có → theo hướng mặt. */
    aim?: SkillTarget;
}
