import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import { SendChatCommand } from "@/rooms/chat/modules/messages/commands/send.chat.command.js";
import { ChatWhisperSchema } from "@/rooms/chat/modules/messages/validators/message.chat.validator.js";
import { ChatErrorCode } from "@/rooms/chat/types/chat-error-code.type.js";
import { ChatClientMessage } from "@/rooms/chat/types/chat-message.type.js";

@SdkMessage({
    errors: [
        ChatErrorCode.CHAT_TARGET_NOT_FOUND,
        ChatErrorCode.CHAT_TARGET_OFFLINE,
        ChatErrorCode.CHAT_TARGET_SELF,
    ],
    note: "Cả người nhận và người gửi nhận `received` (`targetId` là người nhận).",
})
export class SendWhisperChatCommand extends SendChatCommand<typeof ChatWhisperSchema> {
    static readonly message = ChatClientMessage.SEND_WHISPER;

    protected override readonly validateSchema = ChatWhisperSchema;
    protected readonly channelKey = ChatChannelKey.WHISPER;
}
