import { classService } from "@/modules/classes/services/class.service.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { levelService } from "@/modules/levels/services/level.service.js";
import { skillService } from "@/modules/skills/services/skill.service.js";

export const setCacheDataApp = () => {
    return Promise.all([
        skillService.setCacheData(),
        itemService.setCacheData(),
        classService.setCacheData(),
        levelService.setCacheData(),
    ]);
};
