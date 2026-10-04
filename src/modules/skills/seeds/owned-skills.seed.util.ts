import { SkillRepo } from "@/modules/skills/repositories/skill.repository.js";
import type { OwnedSkill } from "@/modules/skills/schemas/skill-config.schema.js";

/** Đổi danh sách code skill thành giá trị cột `skills` (level 1). Dùng trong seed, sau SkillSeed. */
export async function toOwnedSkills(codes: readonly string[]): Promise<OwnedSkill[]> {
    const owned: OwnedSkill[] = [];
    for (const code of codes) {
        const skill = await SkillRepo.findByCode({ code });
        if (!skill) throw new Error(`Skill "${code}" not found — run SkillSeed first`);
        owned.push({ skillId: skill.id, level: 1 });
    }
    return owned;
}
