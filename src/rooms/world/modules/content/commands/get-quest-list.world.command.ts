import { Response } from "@/core/response/response.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import { PlayerWorldCommand } from "@/rooms/world/player.world.command.js";

@SdkMessage({
    response: "QuestListMessage",
    note: "Gọi lúc vào room; sau đó cập nhật theo push `questUpdate` (1 quest đổi) / `questList` (đổi cả danh sách).",
})
export class GetQuestListWorldCommand extends PlayerWorldCommand {
    static readonly message = WorldClientMessage.GET_QUEST_LIST;

    execute() {
        this.result = Response.success(questWorldService.listMessage(this.player));
    }
}
