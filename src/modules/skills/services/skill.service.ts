import { cacheService } from "@/core/cache/cache.service.js";
import type { Skill } from "@/modules/skills/entities/skill.entity.js";
import { HitDelivery, SkillType, TargetType } from "@/modules/skills/enums/skill.enum.js";
import {
    SkillChargeSchema,
    type OwnedSkill,
    type SkillCharge,
    type SkillHitEvent,
} from "@/modules/skills/schemas/skill-config.schema.js";
import { SkillRepo } from "@/modules/skills/repositories/skill.repository.js";

/** Skill `dash`: `animationMs` = thời gian lướt (khoá di chuyển), `cooldownMs` = hồi chiêu — chỉnh ở skill seed, không ở code. */
export const DASH_SKILL_CODE = "dash";

/**
 * Skill lướt tới mục tiêu (kiểu `DASH`, không phải `dash` thường): lướt tới trước mặt mục tiêu, chạm collider thì
 * mới ra đòn — `castRange` = khoảng cách tối đa tới mục tiêu lúc bấm, `animationMs` + hit event tính từ lúc chạm.
 * Dùng chung kiểu `DASH` để không phải thêm giá trị enum (migration).
 */
export const isChargeSkill = (skill: Pick<Skill, "code" | "skillType">) =>
    skill.skillType === SkillType.DASH && skill.code !== DASH_SKILL_CODE;

const chargeConfigs = new WeakMap<object, SkillCharge>();

/** Cấu hình lướt của skill (cột `chargeConfig`) đã điền mặc định, cache theo từng object skill. */
export const getChargeConfig = (skill: Pick<Skill, "chargeConfig">): SkillCharge => {
    let config = chargeConfigs.get(skill);
    if (!config) {
        config = SkillChargeSchema.parse(skill.chargeConfig ?? {});
        chargeConfigs.set(skill, config);
    }
    return config;
};

/** `triggerTicks` của hit event được tác giả theo nhịp 20 tick/giây. */
const AUTHORED_TICK_MS = 50;
/**
 * Khoảng tối thiểu giữa hit cuối và lúc anim kết thúc (`animationMs`). Client chạy anim ngay lúc bấm,
 * sát thương về sau ~1 RTT + 1 patch, nên khoảng này giữ cho sát thương hiện ra trước khi anim xong
 * (RTT tới ~100 ms) mà không phải cho hit nổ sớm hơn frame chém.
 */
const HIT_CONFIRM_BUDGET_MS = 150;

export class SkillService {
    private readonly skillsByCode = new Map<string, Skill>();
    private readonly skillsById = new Map<string, Skill>();

    public async setCacheData() {
        const skills = await SkillRepo.findEnabled();
        const skillsMap = new Map<string, Skill>();
        for (const skill of skills) {
            // Sort sẵn theo thời điểm nổ để room không phải sort lại mỗi lần đánh.
            const skillHitEvents = sortSkillHitEvents(skill.skillHitEvents);
            skillsMap.set(skill.code, { ...skill, skillHitEvents });
            // Skill TARGET: đạn bay / vùng chờ nổ nên trúng sau khi anim xong là bình thường, không cảnh báo.
            if (skill.targetType !== TargetType.TARGET) {
                warnIfLastHitTooLate(skill.code, skill.animationMs, skillHitEvents);
            }
        }
        this.skillsByCode.clear();
        this.skillsById.clear();
        for (const [code, skill] of skillsMap) {
            this.skillsByCode.set(code, skill);
            this.skillsById.set(skill.id, skill);
        }
        await cacheService.set("skills", skillsMap);
        console.log(`Cached ${skillsMap.size} skills`);
    }

    getByCode(code: string): Skill | undefined {
        return this.skillsByCode.get(code);
    }

    getById(id: string): Skill | undefined {
        return this.skillsById.get(id);
    }

    /** The enabled skills currently used by world simulation. */
    getAll(): Skill[] {
        return [...this.skillsById.values()];
    }

    /**
     * Combo đánh thường của một player/monster: các skill `basicAttack` nó sở hữu, đúng thứ tự trong
     * cột `skills` (bước 1, 2, 3…). Skill đã tắt hoặc không tồn tại bị bỏ qua.
     */
    getBasicAttackCombo(owned: Iterable<Pick<OwnedSkill, "skillId">>): Skill[] {
        const combo: Skill[] = [];
        for (const { skillId } of owned) {
            const skill = this.skillsById.get(skillId);
            if (skill?.basicAttack) combo.push(skill);
        }
        return combo;
    }

    /**
     * Skill chủ động của một player: các skill nó sở hữu không thuộc combo đánh thường, không phải dash / passive,
     * đúng thứ tự trong cột `skills`. Input `skill` của client là số thứ tự (từ 1) trong danh sách này.
     */
    getActiveSkills(owned: Iterable<Pick<OwnedSkill, "skillId">>): Skill[] {
        const skills: Skill[] = [];
        for (const { skillId } of owned) {
            const skill = this.skillsById.get(skillId);
            if (!skill || skill.basicAttack) continue;
            // Skill DASH khác `dash` thường là skill lướt tới mục tiêu (isChargeSkill): vẫn là skill chủ động.
            if (skill.code === DASH_SKILL_CODE || skill.skillType === SkillType.PASSIVE) continue;
            skills.push(skill);
        }
        return skills;
    }

    /** `[{ skillId, level: 1 }]` cho danh sách code; lỗi nếu có code không tồn tại/đã tắt. */
    toOwnedSkills(codes: readonly string[]): OwnedSkill[] {
        return codes.map((code) => {
            const skill = this.skillsByCode.get(code);
            if (!skill) throw new Error(`Skill "${code}" is missing or disabled`);
            return { skillId: skill.id, level: 1 };
        });
    }
}

export const skillService = new SkillService();

/** Thứ tự nổ của hit event — server và file config cho client dùng chung. */
export const sortSkillHitEvents = (events: Skill["skillHitEvents"]) =>
    [...events].sort((a, b) => a.triggerTicks - b.triggerTicks || a.eventIndex - b.eventIndex);

function warnIfLastHitTooLate(code: string, animationMs: number, events: Skill["skillHitEvents"]) {
    if (animationMs <= 0) {
        console.warn(`[Skill] ${code}: animationMs is 0 — run \`yarn seed --force\` to update it.`);
        return;
    }
    // Vùng AREA gây damage sau `delayMs`; đạn còn phải bay nên không tính trước được.
    const lastHitMs = Math.max(
        0,
        ...events.map((event) => event.triggerTicks * AUTHORED_TICK_MS + areaDelayMs(event))
    );
    if (lastHitMs + HIT_CONFIRM_BUDGET_MS <= animationMs) return;
    console.warn(
        `[Skill] ${code}: last hit at ${lastHitMs}ms leaves less than ${HIT_CONFIRM_BUDGET_MS}ms ` +
            `before the animation ends (${animationMs}ms) — damage may show after the animation.`
    );
}

const areaDelayMs = (event: SkillHitEvent) =>
    event.delivery === HitDelivery.AREA ? (event.area?.delayMs ?? 0) : 0;
