import { ClassCode } from "@/modules/classes/enums/class-code.enum.js";
import type { NewCharacterClass } from "@/modules/classes/entities/class.entity.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";

/** Skill của class không khai báo ở đây: chúng là file skill do Unity ghi ra, cấp cho class theo `classCode` và `slot`. */
type ClassSeedData = Omit<NewCharacterClass, "skills">;

/** Chạy sau SkillSeed (tham chiếu skill theo id). 3 class khởi đầu, tổng 25 điểm ở level 1. */
export const CLASSES: ClassSeedData[] = [
    {
        code: ClassCode.SWORDSMAN,
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
    },
    {
        code: ClassCode.ARCHER,
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
    },
    {
        code: ClassCode.CLERIC,
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
    },
];
