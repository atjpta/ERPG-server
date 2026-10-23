import { Response } from "@/core/utils/response.util.js";
import { QuestErrorCode } from "@/modules/quests/enums/quest-error-code.enum.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import { questOf } from "@/rooms/world/modules/content/utils/quest-resolve.world.util.js";
import { QuestPreviewSchema } from "@/rooms/world/modules/content/validators/content.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import type { QuestPreviewMessage } from "@/rooms/world/modules/content/interfaces/content.world.message.js";
import {
    PlayerWorldCommand,
    type PlayerCommandPayload,
} from "@/rooms/world/player.world.command.js";

@SdkMessage({
    response: "QuestPreviewMessage",
    errors: [QuestErrorCode.QUEST_NOT_FOUND],
})
export class QuestPreviewWorldCommand extends PlayerWorldCommand<
    PlayerCommandPayload,
    typeof QuestPreviewSchema
> {
    static readonly message = WorldClientMessage.QUEST_PREVIEW;

    protected override readonly validateSchema = QuestPreviewSchema;

    execute() {
        this.result = this.preview(this.player, this.body.questCode);
    }

    /** Xem trước 1 quest (mục tiêu + thưởng) — dùng ở thoại nhận quest và bảng nhiệm vụ. */
    private preview(player: PlayerWorldState, questCode: string) {
        const quest = questOf(player, questCode);
        if (!quest) return Response.error(QuestErrorCode.QUEST_NOT_FOUND);
        return Response.success<QuestPreviewMessage>({
            quest: questWorldService.toMessage(player, quest),
        });
    }
}
