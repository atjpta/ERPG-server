import { Response } from "@/core/response/response.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import { PlayerWorldCommand } from "@/rooms/world/player.world.command.js";

@SdkMessage({
    response: "NpcMarkersMessage",
    note: "Gọi lúc vào room; sau đó cập nhật theo push `npcMarkers`.",
})
export class GetNpcMarkersWorldCommand extends PlayerWorldCommand {
    static readonly message = WorldClientMessage.GET_NPC_MARKERS;

    execute() {
        this.result = Response.success(questWorldService.markersMessage(this.room, this.player));
    }
}
