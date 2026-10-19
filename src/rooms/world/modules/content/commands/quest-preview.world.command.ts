import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { sendOk } from "@/core/utils/room-send.util.js";
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
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface ContentPayload {
    client: PlayerClient;
    payload: unknown;
}

@SdkMessage({
    replies: [WorldMessage.QUEST_PREVIEW],
    note: "Quest không tồn tại thì server im lặng, không có reply.",
})
export class QuestPreviewWorldCommand extends Command<WorldRoom, ContentPayload> {
    static readonly message = WorldClientMessage.QUEST_PREVIEW;

    execute({ client, payload }: ContentPayload) {
        const player = this.room.state.players.get(client.auth.playerId);
        const parsed = QuestPreviewSchema.safeParse(payload);
        if (!player || !parsed.success) return;
        this.sendPreview(client, player, parsed.data.questCode);
    }

    /** Xem trước 1 quest (mục tiêu + thưởng) — dùng ở thoại nhận quest và bảng nhiệm vụ. */
    private sendPreview(client: PlayerClient, player: PlayerWorldState, questCode: string) {
        const quest = questOf(player, questCode);
        if (!quest) return;
        const message: QuestPreviewMessage = { quest: questWorldService.toMessage(player, quest) };
        sendOk(client, WorldMessage.QUEST_PREVIEW, message);
    }
}
