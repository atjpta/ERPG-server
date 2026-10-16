import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/user/services/master-data-cache.service.js";
import { skillService } from "@/modules/skills/services/skill.service.js";
import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import { buildClientSkillConfig } from "@/rooms/world/combat/utils/skill-config.world.util.js";
import { WorldMessage } from "@/rooms/world/world.message.js";

/** Replies from the same in-memory skill and targeting data that simulation reads. */
export function sendSkillConfigs(client: PlayerClient): void {
    try {
        const config = buildClientSkillConfig(
            skillService.getAll(),
            masterDataCacheService.get(MasterDataKey.PLAYER_TARGET_CONFIG)
        );
        client.send(WorldMessage.SKILL_CONFIGS, JSON.stringify(config));
    } catch (error) {
        console.error("[World] Could not build client skill configuration", error);
        client.send(
            WorldMessage.SKILL_CONFIGS,
            JSON.stringify({ error: "Skill configuration unavailable." })
        );
    }
}
