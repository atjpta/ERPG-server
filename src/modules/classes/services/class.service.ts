import { cacheService } from "@/core/cache/cache.service.js";
import type { CharacterClass } from "@/modules/classes/entities/class.entity.js";
import { STARTER_CLASS_CODES } from "@/modules/classes/constants/class.constant.js";
import { ClassRepo } from "@/modules/classes/repositories/class.repository.js";
import { buildClassLineages } from "@/modules/classes/utils/class-tree.util.js";

/** Cache class lúc khởi động (giống SkillService/ItemService). */
export class ClassService {
    private readonly classesById = new Map<string, CharacterClass>();
    private readonly classesByCode = new Map<string, CharacterClass>();
    /** code → chính nó + mọi class gốc. */
    private lineages = new Map<string, Set<string>>();

    public async setCacheData() {
        const classes = await ClassRepo.findEnabled();
        this.classesById.clear();
        this.classesByCode.clear();
        for (const characterClass of classes) {
            this.classesById.set(characterClass.id, characterClass);
            this.classesByCode.set(characterClass.code, characterClass);
        }
        this.lineages = buildClassLineages(classes);
        await cacheService.set("classes", this.classesByCode);
        console.log(`Cached ${classes.length} classes`);
    }

    getById(id: string): CharacterClass | undefined {
        return this.classesById.get(id);
    }

    getByCode(code: string): CharacterClass | undefined {
        return this.classesByCode.get(code);
    }

    /** Class khởi đầu (tier 1) cho màn tạo nhân vật, theo thứ tự STARTER_CLASS_CODES. */
    listStarter(): CharacterClass[] {
        return STARTER_CLASS_CODES.map((code) => this.classesByCode.get(code)).filter(
            (characterClass): characterClass is CharacterClass => characterClass !== undefined
        );
    }

    getByIdOrFail(id: string): CharacterClass {
        const characterClass = this.classesById.get(id);
        if (!characterClass) throw new Error(`Class ${id} is missing or disabled`);
        return characterClass;
    }

    /**
     * Class `classId` dùng được đồ gắn `itemClassCode` không: `null` = mọi class, còn lại phải là
     * chính class đó hoặc class gốc của nó.
     */
    canUseClassItem(classId: string, itemClassCode: string | null): boolean {
        if (itemClassCode === null) return true;
        const characterClass = this.classesById.get(classId);
        if (!characterClass) return false;
        return this.lineages.get(characterClass.code)?.has(itemClassCode) ?? false;
    }
}

export const classService = new ClassService();
