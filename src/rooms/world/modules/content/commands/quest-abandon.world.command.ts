import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { QuestErrorCode } from "@/modules/quests/enums/quest-error-code.enum.js";
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

@SdkMessage({
    replies: [WorldMessage.QUEST_UPDATE, WorldMessage.NPC_MARKERS, WorldMessage.QUEST_TARGETS],
    note: "Quest không bỏ được (không có / không cho bỏ) thì server im lặng, không có reply.",
})
export class QuestAbandonWorldCommand extends Command<WorldRoom, ContentPayload> {
    static readonly message = WorldClientMessage.QUEST_ABANDON;

    execute({ client, payload }: ContentPayload) {
        const player = this.room.state.players.get(client.auth.playerId);
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
        if (!quest || entry?.status !== "active") return QuestErrorCode.QUEST_NOT_ACTIVE;
        if (quest.category === QuestCategory.DAILY) return QuestErrorCode.QUEST_CANNOT_ABANDON;
        delete player.quests[questCode];
        questWorldService.sendUpdate(client, player, quest);
        questWorldService.sendMarkers(room, client, player);
        questWorldService.sendTargets(client, player);
        return undefined;
    }
}
