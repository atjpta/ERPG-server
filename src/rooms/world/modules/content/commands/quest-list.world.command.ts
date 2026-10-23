import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import { PlayerWorldCommand } from "@/rooms/world/player.world.command.js";

interface ContentPayload {
    client: PlayerClient;
    payload: unknown;
}

@SdkMessage({
    replies: [
        WorldMessage.QUEST_LIST,
        WorldMessage.NPC_MARKERS,
        WorldMessage.QUEST_TARGETS,
        WorldMessage.FEATURES,
    ],
})
export class QuestListWorldCommand extends PlayerWorldCommand<ContentPayload> {
    static readonly message = WorldClientMessage.QUEST_LIST;

    execute({ client }: ContentPayload) {
        questWorldService.sendInitial(this.room, client, this.player);
    }
}
