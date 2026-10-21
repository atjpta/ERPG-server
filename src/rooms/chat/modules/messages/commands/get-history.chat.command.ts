import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { PlayerChatCommand } from "@/rooms/chat/commands/player.chat.command.js";
import { chatDeliveryService } from "@/rooms/chat/modules/messages/services/chat-delivery.chat.service.js";
import { ChatHistorySchema } from "@/rooms/chat/modules/messages/validators/message.chat.validator.js";
import { ChatClientMessage, ChatMessage } from "@/rooms/chat/types/chat-message.type.js";

interface Payload extends PlayerCommandPayload {
    payload?: unknown;
}

@SdkMessage({
    replies: [ChatMessage.HISTORY],
    errors: [CommonCode.INVALID_INPUT],
    note: "Chỉ kênh có lưu DB mới có lịch sử; kênh khác (hoặc đang tắt) server im lặng.",
})
export class GetHistoryChatCommand extends PlayerChatCommand<Payload, typeof ChatHistorySchema> {
    static readonly message = ChatClientMessage.GET_HISTORY;

    protected override readonly validateSchema = ChatHistorySchema;
    protected override readonly replyType = ChatMessage.HISTORY;

    async execute({ client }: Payload) {
        await chatDeliveryService.sendHistory({
            room: this.room,
            client,
            channelKey: this.body.channel,
            before: this.body.before,
        });
    }
}
