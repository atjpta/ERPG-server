import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { dialogueWorldService } from "@/rooms/world/modules/content/services/dialogue.world.service.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface ContentPayload {
    client: PlayerClient;
    payload: unknown;
}

export class DialogueCloseWorldCommand extends Command<WorldRoom, ContentPayload> {
    static readonly message = WorldClientMessage.DIALOGUE_CLOSE;

    execute({ client }: ContentPayload) {
        this.close(this.room, client);
    }

    private close(room: WorldRoom, client: PlayerClient) {
        const session = dialogueWorldService.sessionsOf(room).get(client.sessionId);
        if (session) dialogueWorldService.end(room, client, session.sourceCode);
    }
}
