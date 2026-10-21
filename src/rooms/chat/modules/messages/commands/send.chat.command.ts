import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { PlayerChatCommand } from "@/rooms/chat/commands/player.chat.command.js";
import { chatDeliveryService } from "@/rooms/chat/modules/messages/services/chat-delivery.chat.service.js";
import { ChatErrorCode } from "@/rooms/chat/types/chat-error-code.type.js";
import { ChatMessage } from "@/rooms/chat/types/chat-message.type.js";
import type { ChatSendPayload } from "@/rooms/chat/types/chat-room.type.js";
import type { z } from "zod";

interface Payload extends PlayerCommandPayload {
    payload?: unknown;
}

/**
 * Base của mọi lệnh "gửi tin vào một kênh". Command con chỉ khai báo `message`, `validateSchema` và
 * `channelKey`; kiểm tra, người nhận, gửi và lưu DB xử lý chung trong `ChatDeliveryService`.
 */
@SdkMessage({
    replies: [ChatMessage.RECEIVED, ChatMessage.SEND_RESULT],
    errors: [
        CommonCode.INVALID_INPUT,
        CommonCode.TOO_MANY_REQUESTS,
        CommonCode.ROOM_UNAVAILABLE,
        ChatErrorCode.CHAT_CHANNEL_DISABLED,
        ChatErrorCode.CHAT_EMPTY,
        ChatErrorCode.CHAT_TOO_LONG,
    ],
    note: "Thành công: mọi người nhận (gồm cả người gửi) nhận `received`. Thất bại: người gửi nhận `sendResult` thất bại.",
})
export abstract class SendChatCommand<
    TSchema extends z.ZodType<ChatSendPayload>,
> extends PlayerChatCommand<Payload, TSchema> {
    protected abstract readonly channelKey: ChatChannelKey;

    protected override readonly replyType = ChatMessage.SEND_RESULT;

    async execute({ client }: Payload) {
        await chatDeliveryService.send({
            room: this.room,
            client,
            channelKey: this.channelKey,
            payload: this.body,
        });
    }
}
