import { cacheService } from "@/core/cache/cache.service.js";
import type { Skill } from "@/modules/skills/entities/skill.entity.js";
import { SkillRepo } from "@/modules/skills/repositories/skill.repository.js";

/** `triggerTicks` của hit event được tác giả theo nhịp 20 tick/giây. */
const AUTHORED_TICK_MS = 50;
/**
 * Khoảng tối thiểu giữa hit cuối và lúc đòn kết thúc (`castTimeMs`). Client chạy anim ngay lúc bấm,
 * sát thương về sau ~1 RTT + 1 patch, nên khoảng này giữ cho sát thương hiện ra trước khi anim xong
 * (RTT tới ~100 ms) mà không phải cho hit nổ sớm hơn frame chém.
 */
const HIT_CONFIRM_BUDGET_MS = 150;

export class SkillService {
    private readonly skillsByCode = new Map<string, Skill>();

    public async setCacheData() {
        const skills = await SkillRepo.findEnabled();
        const skillsMap = new Map<string, Skill>();
        for (const skill of skills) {
            // Sort sẵn theo thời điểm nổ để room không phải sort lại mỗi lần đánh.
            const skillHitEvents = sortSkillHitEvents(skill.skillHitEvents);
            skillsMap.set(skill.code, { ...skill, skillHitEvents });
            warnIfLastHitTooLate(skill.code, skill.castTimeMs, skillHitEvents);
        }
        this.skillsByCode.clear();
        for (const [code, skill] of skillsMap) this.skillsByCode.set(code, skill);
        await cacheService.set("skills", skillsMap);
        console.log(`Cached ${skillsMap.size} skills`);
    }

    getByCode(code: string): Skill | undefined {
        return this.skillsByCode.get(code);
    }
}

export const skillService = new SkillService();

/** Thứ tự nổ của hit event — server và file config cho client dùng chung. */
export const sortSkillHitEvents = (events: Skill["skillHitEvents"]) =>
    [...events].sort((a, b) => a.triggerTicks - b.triggerTicks || a.eventIndex - b.eventIndex);

function warnIfLastHitTooLate(code: string, castTimeMs: number, events: Skill["skillHitEvents"]) {
    if (castTimeMs <= 0) {
        console.warn(`[Skill] ${code}: castTimeMs is 0 — run \`yarn seed --force\` to update it.`);
        return;
    }
    const lastHitMs = Math.max(0, ...events.map((event) => event.triggerTicks * AUTHORED_TICK_MS));
    if (lastHitMs + HIT_CONFIRM_BUDGET_MS <= castTimeMs) return;
    console.warn(
        `[Skill] ${code}: last hit at ${lastHitMs}ms leaves less than ${HIT_CONFIRM_BUDGET_MS}ms ` +
            `before the attack ends (${castTimeMs}ms) — damage may show after the animation.`
    );
}
