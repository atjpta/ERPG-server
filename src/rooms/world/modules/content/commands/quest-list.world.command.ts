import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

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
export class QuestListWorldCommand extends Command<WorldRoom, ContentPayload> {
    static readonly message = WorldClientMessage.QUEST_LIST;

    execute({ client }: ContentPayload) {
        const player = this.room.state.players.get(client.auth.playerId);
        if (player) questWorldService.sendInitial(this.room, client, player);
    }
}
