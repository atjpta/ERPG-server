import { Skills } from "@/modules/skills/entities/skill.entity.js";
import { loadSkillFiles, skillFileToRow } from "@/modules/skills/seeds/skill-file.util.js";
import { animClipService } from "@/modules/bodies/services/anim-clip.service.js";
import { SkillRepo } from "@/modules/skills/repositories/skill.repository.js";

/**
 * Every skill — the skills of the classes, the dash and the attacks of the monsters — is a file `data/<code>.skill.json` that the
 * Skill Lab in Unity writes (`skill-file.util.ts`). The seed only loads them; nothing is written by hand here.
 */

/** Skill đã bỏ: tắt (`enabled = false`) chứ không xoá, để dữ liệu cũ còn tra được. ClassSeed gán lại bộ skill mặc định cho player. */
const RETIRED_SKILL_CODES = [
    "swordsman_triple_strike",
    "swordsman_shockwave_slash",
    "cleric_aura_buff",
];

export const SkillSeed = async () => {
    const authored = loadSkillFiles().map(skillFileToRow);

    for (const skill of authored) {
        await SkillRepo.upsert({
            data: skill,
            target: Skills.code,
            matchValue: skill.code,
            updateData: skill,
        });
    }

    for (const code of RETIRED_SKILL_CODES) {
        const retired = await SkillRepo.findByCode({ code });
        if (retired?.enabled)
            await SkillRepo.updateById({ id: retired.id, data: { enabled: false } });
    }

    // Skills are authored in Unity, but must not outlast the Unity clip they play.
    const timed = authored.map((skill) => ({
        code: skill.code,
        animationMs: skill.animationMs ?? 0,
        castTimeMs: skill.castTimeMs ?? 0,
        skillHitEvents: skill.skillHitEvents ?? [],
    }));
    for (const warning of animClipService.skillClipWarnings(timed))
        console.warn(`⚠️ [SkillSeed] ${warning}`);

    console.info("✅ [SkillSeed] Done");
};
