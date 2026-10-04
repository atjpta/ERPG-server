import { cacheService } from "@/core/cache/cache.service.js";
import { LevelRepo } from "@/modules/levels/repositories/level.repository.js";

/** Cache bảng exp lúc khởi động (giống SkillService). */
export class LevelService {
    private readonly expToNextByLevel = new Map<number, number>();

    public async setCacheData() {
        const levels = await LevelRepo.findAll();
        this.expToNextByLevel.clear();
        for (const { level, exp } of levels) this.expToNextByLevel.set(level, exp);
        await cacheService.set("levels", this.expToNextByLevel);
        console.log(`Cached ${levels.length} levels`);
    }

    /** Exp cần tích luỹ ở `level` để lên `level + 1`; `undefined` = level tối đa (không lên nữa). */
    getExpToNext(level: number): number | undefined {
        return this.expToNextByLevel.get(level);
    }
}

export const levelService = new LevelService();
