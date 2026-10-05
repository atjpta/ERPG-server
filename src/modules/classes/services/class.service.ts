import { cacheService } from "@/core/cache/cache.service.js";
import type { CharacterClass } from "@/modules/classes/entities/class.entity.js";
import { STARTER_CLASS_CODES } from "@/modules/classes/constants/class.constant.js";
import { ClassRepo } from "@/modules/classes/repositories/class.repository.js";
import {
    buildUsableItemClassCodes,
    validateClassTree,
} from "@/modules/classes/utils/class-tree.util.js";

/** Cache class lúc khởi động (giống SkillService/ItemService). */
export class ClassService {
    private readonly classesById = new Map<string, CharacterClass>();
    private readonly classesByCode = new Map<string, CharacterClass>();
    /** code → class được mặc đồ: chính nó + các class tier thấp hơn chuyển cấp tới nó. */
    private usableItemClassCodes = new Map<string, Set<string>>();

    public async setCacheData() {
        const classes = await ClassRepo.findEnabled();
        // Cây chuyển cấp sai thì dừng lúc khởi động, không để lệch quyền mặc đồ khi đang chơi.
        const errors = validateClassTree(classes);
        if (errors.length > 0) throw new Error(`Invalid class tree: ${errors.join("; ")}`);
        this.classesById.clear();
        this.classesByCode.clear();
        for (const characterClass of classes) {
            this.classesById.set(characterClass.id, characterClass);
            this.classesByCode.set(characterClass.code, characterClass);
        }
        this.usableItemClassCodes = buildUsableItemClassCodes(classes);
        await cacheService.set("classes", this.classesByCode);
        console.log(`Cached ${classes.length} classes`);
    }

    getById(id: string): CharacterClass | undefined {
        return this.classesById.get(id);
    }

    getByCode(code: string): CharacterClass | undefined {
        return this.classesByCode.get(code);
    }

    /** Mọi class đang bật, theo tier. */
    listAll(): CharacterClass[] {
        return [...this.classesById.values()].sort((a, b) => a.tier - b.tier);
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

    /** Code class mà class `code` mặc được đồ (chính nó + class tier thấp hơn chuyển cấp tới nó). */
    getUsableItemClassCodes(code: string): string[] {
        return [...(this.usableItemClassCodes.get(code) ?? [])];
    }

    /**
     * Class tier 1 mà `code` chuyển cấp lên từ đó (chính nó nếu đã là tier 1) — client dùng hình/animation
     * của class gốc cho các class tier cao chưa có asset riêng.
     */
    getBaseClassCode(code: string): string {
        for (const candidate of this.usableItemClassCodes.get(code) ?? []) {
            if (this.classesByCode.get(candidate)?.tier === 1) return candidate;
        }
        return code;
    }

    /**
     * Class `classId` dùng được đồ gắn `itemClassCode` không: `null` = mọi class, còn lại phải là
     * chính class đó hoặc class tier thấp hơn chuyển cấp được tới nó (không mặc đồ class sắp lên).
     */
    canUseClassItem(classId: string, itemClassCode: string | null): boolean {
        if (itemClassCode === null) return true;
        const characterClass = this.classesById.get(classId);
        if (!characterClass) return false;
        return this.usableItemClassCodes.get(characterClass.code)?.has(itemClassCode) ?? false;
    }
}

export const classService = new ClassService();
