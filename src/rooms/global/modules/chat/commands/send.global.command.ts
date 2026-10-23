import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";
import { chatDeliveryService } from "@/rooms/global/modules/chat/services/chat-delivery.global.service.js";
import type { ChatSendPayload } from "@/rooms/global/modules/chat/types/chat-send.type.js";
import { ChatErrorCode } from "@/modules/chat/enums/chat-error-code.enum.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import type { z } from "zod";

interface Payload extends PlayerCommandPayload {
    payload?: unknown;
}

/**
 * Base của mọi lệnh "gửi tin vào một kênh". Command con chỉ khai báo `message`, `validateSchema` và
 * `channelKey`; kiểm tra, người nhận, gửi và lưu DB xử lý chung trong `ChatDeliveryService`.
 */
@SdkMessage({
    replies: [GlobalMessage.CHAT_RECEIVED],
    errors: [
        CommonCode.INVALID_INPUT,
        CommonCode.TOO_MANY_REQUESTS,
        ChatErrorCode.CHAT_CHANNEL_DISABLED,
        ChatErrorCode.CHAT_EMPTY,
        ChatErrorCode.CHAT_TOO_LONG,
    ],
    note: "Thành công: response rỗng, mọi người nhận (gồm cả người gửi) nhận `chatReceived`. Thất bại: response là `Result` thất bại với mã `CHAT_*`.",
})
export abstract class SendChatCommand<
    TSchema extends z.ZodType<ChatSendPayload>,
> extends PlayerGlobalCommand<Payload, TSchema> {
    protected abstract readonly channelKey: ChatChannelKey;

    async execute({ client }: Payload) {
        this.result = await chatDeliveryService.send({
            room: this.room,
            senderId: client.auth.playerId,
            channelKey: this.channelKey,
            payload: this.body,
        });
    }
}
