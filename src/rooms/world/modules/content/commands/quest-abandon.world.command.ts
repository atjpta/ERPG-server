import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { QuestCategory } from "@/modules/quests/enums/quest.enum.js";
import {
    QuestError,
    questWorldService,
} from "@/rooms/world/modules/content/services/quest.world.service.js";
import { questOf } from "@/rooms/world/modules/content/utils/quest-resolve.world.util.js";
import { QuestAbandonSchema } from "@/rooms/world/modules/content/validators/content.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface ContentPayload {
    client: PlayerClient;
    payload: unknown;
}

export class QuestAbandonWorldCommand extends Command<WorldRoom, ContentPayload> {
    static readonly message = WorldClientMessage.QUEST_ABANDON;

    execute({ client, payload }: ContentPayload) {
        const player = this.room.state.players.get(client.sessionId);
        const parsed = QuestAbandonSchema.safeParse(payload);
        if (!player || !parsed.success) return;
        this.abandon(this.room, client, player, parsed.data.questCode);
    }

    private abandon(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        questCode: string
    ): QuestError {
        const quest = questOf(player, questCode);
        const entry = player.quests[questCode];
        if (!quest || entry?.status !== "active") return "Quest not active";
        if (quest.category === QuestCategory.DAILY) return "Cannot abandon a daily quest";
        delete player.quests[questCode];
        questWorldService.sendUpdate(client, player, quest);
        questWorldService.sendMarkers(room, client, player);
        questWorldService.sendTargets(client, player);
        return undefined;
    }
}
