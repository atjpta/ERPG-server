import { Response } from "@/core/response/response.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import { PlayerWorldCommand } from "@/rooms/world/player.world.command.js";

@SdkMessage({
    response: "FeaturesMessage",
    note: "Gọi lúc vào room; sau đó cập nhật theo push `features`.",
})
export class GetFeaturesWorldCommand extends PlayerWorldCommand {
    static readonly message = WorldClientMessage.GET_FEATURES;

    execute() {
        this.result = Response.success(questWorldService.featuresMessage(this.player));
    }
}
