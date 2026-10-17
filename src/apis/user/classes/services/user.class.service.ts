import type { CharacterClass } from "@/modules/classes/entities/class.entity.js";
import { classService } from "@/modules/classes/services/class.service.js";

const toClassView = (characterClass: CharacterClass) => ({
    code: characterClass.code,
    tier: characterClass.tier,
    baseAttributes: characterClass.baseAttributes,
    baseStats: characterClass.baseStats,
    skills: characterClass.skills,
    /** Các hướng chuyển cấp (class con trực thuộc). */
    nextClassCodes: characterClass.nextClassCodes,
    nextClassRequiredLevel: characterClass.nextClassRequiredLevel,
    /** Đồ gắn các class này thì mặc được (client làm mờ đồ không mặc được). */
    usableItemClassCodes: classService.getUsableItemClassCodes(characterClass.code),
});

export class UserClassService {
    listAll() {
        return classService.listAll().map(toClassView);
    }
    listStarter() {
        return classService.listStarter().map(toClassView);
    }
}

export const userClassService = new UserClassService();
