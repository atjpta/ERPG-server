import { cacheService } from "@/core/cache/cache.service.js";
import { SkillRepo } from "@/modules/skills/repositories/skill.repository.js";

export class SkillService {
    public async setCacheData() {
        const skills = await SkillRepo.findMany();
        const skillsMap = new Map<string, (typeof skills)[0]>();
        for (const skill of skills) {
            skillsMap.set(skill.code, skill);
        }
        cacheService.set("skills", skillsMap);
        console.log(`Cached ${skillsMap.size} skills`);
    }
}

export const skillService = new SkillService();
