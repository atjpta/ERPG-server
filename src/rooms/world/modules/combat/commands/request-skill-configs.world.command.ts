import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { WorldErrorCode } from "@/rooms/world/enums/world-error-code.enum.js";
import { Response } from "@/core/utils/response.util.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { skillService } from "@/modules/skills/services/skill.service.js";
import { buildClientSkillConfig } from "@/rooms/world/modules/combat/utils/skill-config.world.util.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import { PlayerWorldCommand } from "@/rooms/world/player.world.command.js";

@SdkMessage({
    response: "string",
    errors: [WorldErrorCode.SKILL_CONFIG_UNAVAILABLE],
})
export class RequestSkillConfigsWorldCommand extends PlayerWorldCommand {
    static readonly message = WorldClientMessage.REQUEST_SKILL_CONFIGS;

    execute() {
        try {
            const config = buildClientSkillConfig(
                skillService.getAll(),
                masterDataCacheService.get(MasterDataKey.PLAYER_TARGET_CONFIG)
            );
            this.result = Response.success(JSON.stringify(config));
        } catch (error) {
            console.error("[World] Could not build client skill configuration", error);
            this.result = Response.error(WorldErrorCode.SKILL_CONFIG_UNAVAILABLE);
        }
    }
}
