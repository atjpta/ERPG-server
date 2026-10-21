import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import { questOf } from "@/rooms/world/modules/content/utils/quest-resolve.world.util.js";
import { QuestPreviewSchema } from "@/rooms/world/modules/content/validators/content.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import {
    WorldClientMessage,
    WorldMessage,
    type QuestPreviewMessage,
} from "@/rooms/world/types/world-message.type.js";
import { PlayerWorldCommand } from "@/rooms/world/commands/player.world.command.js";

interface ContentPayload {
    client: PlayerClient;
    payload: unknown;
}

@SdkMessage({
    replies: [WorldMessage.QUEST_PREVIEW],
    note: "Quest không tồn tại thì server im lặng, không có reply.",
})
export class QuestPreviewWorldCommand extends PlayerWorldCommand<
    ContentPayload,
    typeof QuestPreviewSchema
> {
    static readonly message = WorldClientMessage.QUEST_PREVIEW;

    protected override readonly validateSchema = QuestPreviewSchema;

    execute({ client }: ContentPayload) {
        this.sendPreview(client, this.player, this.body.questCode);
    }

    /** Xem trước 1 quest (mục tiêu + thưởng) — dùng ở thoại nhận quest và bảng nhiệm vụ. */
    private sendPreview(client: PlayerClient, player: PlayerWorldState, questCode: string) {
        const quest = questOf(player, questCode);
        if (!quest) return;
        const message: QuestPreviewMessage = { quest: questWorldService.toMessage(player, quest) };
        client.sendSuccess(WorldMessage.QUEST_PREVIEW, message);
    }
}
