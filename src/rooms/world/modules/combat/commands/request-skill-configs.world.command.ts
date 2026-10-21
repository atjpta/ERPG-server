import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { WorldErrorCode } from "@/rooms/world/types/world-error-code.type.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { skillService } from "@/modules/skills/services/skill.service.js";
import { buildClientSkillConfig } from "@/rooms/world/modules/combat/utils/skill-config.world.util.js";
import { WorldClientMessage, WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { PlayerWorldCommand } from "@/rooms/world/commands/player.world.command.js";

@SdkMessage({
    replies: [WorldMessage.SKILL_CONFIGS],
    errors: [WorldErrorCode.SKILL_CONFIG_UNAVAILABLE],
})
export class RequestSkillConfigsWorldCommand extends PlayerWorldCommand<{ client: PlayerClient }> {
    static readonly message = WorldClientMessage.REQUEST_SKILL_CONFIGS;

    execute({ client }: { client: PlayerClient }) {
        try {
            const config = buildClientSkillConfig(
                skillService.getAll(),
                masterDataCacheService.get(MasterDataKey.PLAYER_TARGET_CONFIG)
            );
            client.sendSuccess(WorldMessage.SKILL_CONFIGS, JSON.stringify(config));
        } catch (error) {
            console.error("[World] Could not build client skill configuration", error);
            client.sendError(WorldMessage.SKILL_CONFIGS, WorldErrorCode.SKILL_CONFIG_UNAVAILABLE);
        }
    }
}
