import { cacheService } from "@/core/cache/cache.service.js";
import type { CharacterClass } from "@/modules/classes/entities/class.entity.js";
import { ClassRepo } from "@/modules/classes/repositories/class.repository.js";

/** Cache class lúc khởi động (giống SkillService/ItemService); chưa có nghiệp vụ. */
export class ClassService {
    private readonly classesById = new Map<string, CharacterClass>();
    private readonly classesByCode = new Map<string, CharacterClass>();

    public async setCacheData() {
        const classes = await ClassRepo.findEnabled();
        this.classesById.clear();
        this.classesByCode.clear();
        for (const characterClass of classes) {
            this.classesById.set(characterClass.id, characterClass);
            this.classesByCode.set(characterClass.code, characterClass);
        }
        await cacheService.set("classes", this.classesByCode);
        console.log(`Cached ${classes.length} classes`);
    }

    getById(id: string): CharacterClass | undefined {
        return this.classesById.get(id);
    }

    getByCode(code: string): CharacterClass | undefined {
        return this.classesByCode.get(code);
    }

    getByIdOrFail(id: string): CharacterClass {
        const characterClass = this.classesById.get(id);
        if (!characterClass) throw new Error(`Class ${id} is missing or disabled`);
        return characterClass;
    }
}

export const classService = new ClassService();
