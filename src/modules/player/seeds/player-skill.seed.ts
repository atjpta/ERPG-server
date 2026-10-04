import { PLAYER_DEFAULT_SKILL_CODES } from "@/modules/player/constants/player.constant.js";
import { PlayerStateRepo } from "@/modules/player/repositories/player-state.repository.js";
import { toOwnedSkills } from "@/modules/skills/seeds/owned-skills.seed.util.js";

/** Player tạo trước khi có cột `skills` → gán bộ skill mặc định. Chạy sau SkillSeed. */
export const PlayerSkillSeed = async () => {
    const updated = await PlayerStateRepo.fillEmptySkills(
        await toOwnedSkills(PLAYER_DEFAULT_SKILL_CODES)
    );
    console.info(`✅ [PlayerSkillSeed] ${updated.length} players got default skills`);
};
