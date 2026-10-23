import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";
import { chatDeliveryService } from "@/rooms/global/modules/chat/services/chat-delivery.global.service.js";
import { ChatHistorySchema } from "@/rooms/global/modules/chat/validators/message.chat.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";

interface Payload extends PlayerCommandPayload {
    payload?: unknown;
}

@SdkMessage({
    response: "ChatHistoryMessage",
    errors: [CommonCode.INVALID_INPUT],
    note: "Chỉ kênh có lưu DB mới có lịch sử; kênh khác (hoặc đang tắt) trả trang rỗng.",
})
export class GetHistoryChatCommand extends PlayerGlobalCommand<Payload, typeof ChatHistorySchema> {
    static readonly message = GlobalClientMessage.GET_HISTORY;

    protected override readonly validateSchema = ChatHistorySchema;

    async execute({ client }: Payload) {
        this.result = Response.success(
            await chatDeliveryService.history({
                room: this.room,
                playerId: client.auth.playerId,
                channelKey: this.body.channel,
                before: this.body.before,
            })
        );
    }
}
