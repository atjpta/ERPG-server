import { Classes, type NewCharacterClass } from "@/modules/classes/entities/class.entity.js";
import { toOwnedSkills } from "@/modules/skills/seeds/owned-skills.seed.util.js";
import { ClassRepo } from "@/modules/classes/repositories/class.repository.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";

interface ClassSeedData extends Omit<NewCharacterClass, "skills"> {
    /** Skill mặc định theo code, đúng thứ tự combo đánh thường. */
    skillCodes: string[];
}

/** Chạy sau SkillSeed (tham chiếu skill theo id). */
const CLASSES: ClassSeedData[] = [
    {
        code: "swordman",
        name: "Swordman",
        tier: 1,
        nextClassCodes: [],
        nextClassRequiredLevel: null,
        // Tổng 25 điểm ở level 1.
        baseAttributes: {
            [StatKey.STRENGTH]: 7,
            [StatKey.DEXTERITY]: 5,
            [StatKey.INTELLIGENCE]: 3,
            [StatKey.VITALITY]: 7,
            [StatKey.LUCK]: 3,
        },
        statBonuses: [],
        skillCodes: ["swordman_slash_1", "swordman_slash_2", "swordman_slash_3"],
    },
];

export const ClassSeed = async () => {
    for (const { skillCodes, ...rest } of CLASSES) {
        const characterClass: NewCharacterClass = {
            ...rest,
            skills: await toOwnedSkills(skillCodes),
        };
        await ClassRepo.upsert({
            data: characterClass,
            target: Classes.code,
            matchValue: characterClass.code,
            updateData: characterClass,
        });
    }
    console.info("✅ [ClassSeed] Done");
};
