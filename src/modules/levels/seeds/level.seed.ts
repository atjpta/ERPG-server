import { LevelRepo } from "@/modules/levels/repositories/level.repository.js";

const MAX_LEVEL = 100;

/** Tạm: exp lên level kế tiếp = 100 × level^1.5 (làm tròn). Chỉnh lại khi cân bằng game. */
const expToNextLevel = (level: number) => Math.round(100 * level ** 1.5);

export const LevelSeed = async (force = false) => {
    const levels = Array.from({ length: MAX_LEVEL }, (_, index) => ({
        level: index + 1,
        exp: expToNextLevel(index + 1),
    }));
    await LevelRepo.upsertMany({ levels, force });
    console.info(`✅ [LevelSeed] ${levels.length} levels`);
};
