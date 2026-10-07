import { Classes, type NewCharacterClass } from "@/modules/classes/entities/class.entity.js";
import { toOwnedSkills } from "@/modules/skills/seeds/owned-skills.seed.util.js";
import { ClassRepo } from "@/modules/classes/repositories/class.repository.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import { PlayerStateRepo } from "@/modules/player/repositories/player-state.repository.js";

interface ClassSeedData extends Omit<NewCharacterClass, "skills"> {
    /** Skill mặc định theo code, đúng thứ tự combo đánh thường. */
    skillCodes: string[];
}

/** Chạy sau SkillSeed (tham chiếu skill theo id). 3 class khởi đầu, tổng 25 điểm ở level 1. */
const CLASSES: ClassSeedData[] = [
    {
        code: "swordsman",
        name: "Swordsman",
        tier: 1,
        nextClassCodes: [],
        nextClassRequiredLevel: null,
        baseAttributes: {
            [StatKey.STRENGTH]: 7,
            [StatKey.DEXTERITY]: 5,
            [StatKey.INTELLIGENCE]: 3,
            [StatKey.VITALITY]: 7,
            [StatKey.LUCK]: 3,
        },
        baseStats: {
            [StatKey.MOVE_SPEED]: 4,
            [StatKey.MAX_HP]: 100,
            [StatKey.MAX_MP]: 30,
            [StatKey.PHYSICAL_ATTACK]: 5,
            [StatKey.PHYSICAL_DEFENSE]: 5,
            [StatKey.HP_REGEN]: 1,
            [StatKey.MP_REGEN]: 0.5,
        },
        statBonuses: [],
        skillCodes: ["swordsman_basic_attack"],
    },
    {
        code: "archer",
        name: "Archer",
        tier: 1,
        nextClassCodes: [],
        nextClassRequiredLevel: null,
        baseAttributes: {
            [StatKey.STRENGTH]: 5,
            [StatKey.DEXTERITY]: 9,
            [StatKey.INTELLIGENCE]: 3,
            [StatKey.VITALITY]: 5,
            [StatKey.LUCK]: 3,
        },
        baseStats: {
            [StatKey.MOVE_SPEED]: 4.2,
            [StatKey.MAX_HP]: 80,
            [StatKey.MAX_MP]: 40,
            [StatKey.PHYSICAL_ATTACK]: 5,
            [StatKey.ACCURACY]: 5,
            [StatKey.HP_REGEN]: 0.8,
            [StatKey.MP_REGEN]: 0.6,
        },
        statBonuses: [],
        skillCodes: ["archer_basic_attack"],
    },
    {
        code: "cleric",
        name: "Cleric",
        tier: 1,
        nextClassCodes: [],
        nextClassRequiredLevel: null,
        baseAttributes: {
            [StatKey.STRENGTH]: 3,
            [StatKey.DEXTERITY]: 3,
            [StatKey.INTELLIGENCE]: 9,
            [StatKey.VITALITY]: 7,
            [StatKey.LUCK]: 3,
        },
        baseStats: {
            [StatKey.MOVE_SPEED]: 3.8,
            [StatKey.MAX_HP]: 90,
            [StatKey.MAX_MP]: 70,
            [StatKey.MAGIC_ATTACK]: 4,
            [StatKey.MAGIC_DEFENSE]: 6,
            [StatKey.HP_REGEN]: 1,
            [StatKey.MP_REGEN]: 1.2,
        },
        statBonuses: [],
        skillCodes: ["cleric_basic_attack"],
    },
];

export const ClassSeed = async () => {
    for (const { skillCodes, ...rest } of CLASSES) {
        const skills = await toOwnedSkills(skillCodes);
        const characterClass: NewCharacterClass = { ...rest, skills };
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
