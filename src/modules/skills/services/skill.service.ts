import { cacheService } from "@/core/cache/cache.service.js";
import type { Skill } from "@/modules/skills/entities/skill.entity.js";
import { SkillRepo } from "@/modules/skills/repositories/skill.repository.js";

export class SkillService {
    private readonly skillsByCode = new Map<string, Skill>();

    public async setCacheData() {
        const skills = await SkillRepo.findEnabled();
        const skillsMap = new Map<string, Skill>();
        for (const skill of skills) {
            skillsMap.set(skill.code, skill);
        }
        this.skillsByCode.clear();
        for (const [code, skill] of skillsMap) this.skillsByCode.set(code, skill);
        await cacheService.set("skills", skillsMap);
        console.log(`Cached ${skillsMap.size} skills`);
    }

    getByCode(code: string): Skill | undefined {
        return this.skillsByCode.get(code);
    }
}

export const skillService = new SkillService();
