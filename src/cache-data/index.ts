import { classService } from "@/modules/classes/services/class.service.js";
import { dialogueService } from "@/modules/dialogues/services/dialogue.service.js";
import { npcService } from "@/modules/npcs/services/npc.service.js";
import { questService } from "@/modules/quests/services/quest.service.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { levelService } from "@/modules/levels/services/level.service.js";
import { masterDataCacheService } from "@/modules/master-data/user/services/master-data-cache.service.js";
import { skillService } from "@/modules/skills/services/skill.service.js";

export const setCacheDataApp = () => {
    return Promise.all([
        skillService.setCacheData(),
        itemService.setCacheData(),
        classService.setCacheData(),
        levelService.setCacheData(),
        masterDataCacheService.setCacheData(),
        dialogueService.setCacheData(),
        npcService.setCacheData(),
        questService.setCacheData(),
    ]);
};
