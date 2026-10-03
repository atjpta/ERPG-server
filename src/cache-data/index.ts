import { skillService } from "@/modules/skills/services/skill.service.js";

export const setCacheDataApp = () => {
    return Promise.all([skillService.setCacheData()]);
};
