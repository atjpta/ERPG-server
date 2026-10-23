import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import { SendChatCommand } from "@/rooms/global/modules/chat/commands/send.global.command.js";
import { ChatWhisperSchema } from "@/rooms/global/modules/chat/validators/message.chat.validator.js";
import { ChatErrorCode } from "@/rooms/global/modules/chat/enums/chat-error-code.enum.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";

@SdkMessage({
    errors: [
        ChatErrorCode.CHAT_TARGET_NOT_FOUND,
        ChatErrorCode.CHAT_TARGET_OFFLINE,
        ChatErrorCode.CHAT_TARGET_SELF,
    ],
    note: "Cả người nhận và người gửi nhận `received` (`targetId` là người nhận).",
})
export class SendWhisperChatCommand extends SendChatCommand<typeof ChatWhisperSchema> {
    static readonly message = GlobalClientMessage.SEND_WHISPER;

    protected override readonly validateSchema = ChatWhisperSchema;
    protected readonly channelKey = ChatChannelKey.WHISPER;
}
