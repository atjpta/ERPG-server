import { Classes, type NewCharacterClass } from "@/modules/classes/entities/class.entity.js";
import { withFileSkills } from "@/modules/skills/seeds/skill-file.util.js";
import { toOwnedSkills } from "@/modules/skills/seeds/owned-skills.seed.util.js";
import { ClassRepo } from "@/modules/classes/repositories/class.repository.js";
import { PlayerStateRepo } from "@/modules/player/repositories/player-state.repository.js";
import { CLASSES } from "@/modules/classes/seeds/class.seed-data.js";

export const ClassSeed = async () => {
    for (const data of CLASSES) {
        const skills = await toOwnedSkills(withFileSkills(data.code, []));
        const characterClass: NewCharacterClass = { ...data, skills };
        const saved = await ClassRepo.upsert({
            data: characterClass,
            target: Classes.code,
            matchValue: characterClass.code,
            updateData: characterClass,
        });
        // Chưa có học skill: skill của player = bộ mặc định của class, đổi bộ này thì đổi luôn cho player.
        await PlayerStateRepo.replaceClassSkills(saved.id, skills);
    }
    console.info("✅ [ClassSeed] Done");
};
