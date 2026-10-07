import { Command } from "@colyseus/command";
import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import { dialogueWorldService } from "@/rooms/world/services/dialogue.world.service.js";
import { interactWorldService } from "@/rooms/world/services/interact.world.service.js";
import { questWorldService } from "@/rooms/world/services/quest.world.service.js";
import {
    DialogueChooseSchema,
    InteractNpcSchema,
    InteractSchema,
    QuestAbandonSchema,
} from "@/rooms/world/validators/content.world.validator.js";
import {
    WorldMessage,
    type DialogueEndMessage,
    type InteractResultMessage,
} from "@/rooms/world/world.message.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

interface ContentPayload {
    client: PlayerClient;
    payload: unknown;
}

/** Tương tác vật thể trong map (portal, thu thập, biển báo). */
export class InteractWorldCommand extends Command<WorldRoom, ContentPayload> {
    async execute({ client, payload }: ContentPayload) {
        const player = this.room.state.players.get(client.sessionId);
        if (!player) return;
        const parsed = InteractSchema.safeParse(payload);
        if (!parsed.success) {
            const message: InteractResultMessage = { ok: false, error: "Invalid payload", id: "" };
            client.send(WorldMessage.INTERACT_RESULT, message);
            return;
        }
        await interactWorldService.interact(this.room, client, player, parsed.data.id);
    }
}

/** Bắt đầu nói chuyện với NPC. */
export class InteractNpcWorldCommand extends Command<WorldRoom, ContentPayload> {
    execute({ client, payload }: ContentPayload) {
        const player = this.room.state.players.get(client.sessionId);
        if (!player) return;
        const parsed = InteractNpcSchema.safeParse(payload);
        const error = !parsed.success
            ? "Invalid payload"
            : player.hp <= 0
              ? "Player is dead"
              : dialogueWorldService.startNpc(this.room, client, player, parsed.data.npcCode);
        if (error) {
            const message: DialogueEndMessage = {
                sourceCode: parsed.success ? parsed.data.npcCode : "",
                error,
            };
            client.send(WorldMessage.DIALOGUE_END, message);
        }
    }
}

export class DialogueChooseWorldCommand extends Command<WorldRoom, ContentPayload> {
    execute({ client, payload }: ContentPayload) {
        const player = this.room.state.players.get(client.sessionId);
        if (!player) return;
        const parsed = DialogueChooseSchema.safeParse(payload);
        if (!parsed.success) return;
        dialogueWorldService.choose(this.room, client, player, parsed.data.optionId);
    }
}

export class DialogueCloseWorldCommand extends Command<WorldRoom, ContentPayload> {
    execute({ client }: ContentPayload) {
        dialogueWorldService.close(this.room, client);
    }
}

export class QuestListWorldCommand extends Command<WorldRoom, ContentPayload> {
    execute({ client }: ContentPayload) {
        const player = this.room.state.players.get(client.sessionId);
        if (player) questWorldService.sendInitial(this.room, client, player);
    }
}

export class QuestAbandonWorldCommand extends Command<WorldRoom, ContentPayload> {
    execute({ client, payload }: ContentPayload) {
        const player = this.room.state.players.get(client.sessionId);
        const parsed = QuestAbandonSchema.safeParse(payload);
        if (!player || !parsed.success) return;
        questWorldService.abandon(this.room, client, player, parsed.data.questCode);
    }
}
