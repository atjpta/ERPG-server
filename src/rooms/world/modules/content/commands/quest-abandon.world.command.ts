import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { Response } from "@/core/response/response.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { QuestErrorCode } from "@/modules/quests/enums/quest-error-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { QuestCategory } from "@/modules/quests/enums/quest.enum.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import { questOf } from "@/modules/quests/utils/quest-resolve.util.js";
import { QuestAbandonSchema } from "@/rooms/world/modules/content/validators/content.world.validator.js";
import type { PlayerWorldState } from "@/modules/player/state/player-world.state.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { PlayerWorldCommand } from "@/rooms/world/player.world.command.js";

interface ContentPayload {
    client: PlayerClient;
    payload: unknown;
}

@SdkMessage({
    replies: [WorldMessage.QUEST_UPDATE, WorldMessage.NPC_MARKERS, WorldMessage.QUEST_TARGETS],
    errors: [QuestErrorCode.QUEST_NOT_ACTIVE, QuestErrorCode.QUEST_CANNOT_ABANDON],
    note: "Quest không bỏ được (không đang làm / quest hằng ngày) thì trả lỗi tương ứng.",
})
export class QuestAbandonWorldCommand extends PlayerWorldCommand<
    ContentPayload,
    typeof QuestAbandonSchema
> {
    static readonly message = WorldClientMessage.QUEST_ABANDON;

    protected override readonly validateSchema = QuestAbandonSchema;

    execute({ client }: ContentPayload) {
        this.result = this.abandon(this.room, client, this.player, this.body.questCode);
    }

    private abandon(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        questCode: string
    ): Response {
        const quest = questOf(player, questCode);
        const entry = player.playerState.questLog.entryOf(questCode);
        if (!quest || entry?.status !== "active")
            return Response.error(QuestErrorCode.QUEST_NOT_ACTIVE);
        if (quest.category === QuestCategory.DAILY)
            return Response.error(QuestErrorCode.QUEST_CANNOT_ABANDON);
        player.playerState.questLog.drop(questCode);
        questWorldService.sendUpdate(client, player, quest);
        questWorldService.sendMarkers(room, client, player);
        questWorldService.sendTargets(client, player);
        return Response.success();
    }
}
