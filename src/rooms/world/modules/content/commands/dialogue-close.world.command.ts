import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { dialogueWorldService } from "@/rooms/world/modules/content/services/dialogue.world.service.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { PlayerWorldCommand } from "@/rooms/world/commands/player.world.command.js";

interface ContentPayload {
    client: PlayerClient;
    payload: unknown;
}

@SdkMessage({
    replies: [WorldMessage.DIALOGUE_END],
})
export class DialogueCloseWorldCommand extends PlayerWorldCommand<ContentPayload> {
    static readonly message = WorldClientMessage.DIALOGUE_CLOSE;

    execute({ client }: ContentPayload) {
        this.close(this.room, client);
    }

    private close(room: WorldRoom, client: PlayerClient) {
        const session = dialogueWorldService.sessionsOf(room).get(client.auth.playerId);
        if (session) dialogueWorldService.end(room, client, session.sourceCode);
    }
}
