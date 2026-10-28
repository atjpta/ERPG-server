import { Response } from "@/core/response/response.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import { PlayerWorldCommand } from "@/rooms/world/player.world.command.js";

@SdkMessage({
    response: "QuestTargetsMessage",
    note: "Gọi lúc vào room; sau đó cập nhật theo push `questTargets`.",
})
export class GetQuestTargetsWorldCommand extends PlayerWorldCommand {
    static readonly message = WorldClientMessage.GET_QUEST_TARGETS;

    execute() {
        this.result = Response.success(questWorldService.targetsMessage(this.player));
    }
}
