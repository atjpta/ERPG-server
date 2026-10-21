import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import { SendChatCommand } from "@/rooms/chat/modules/messages/commands/send.chat.command.js";
import { ChatSendSchema } from "@/rooms/chat/modules/messages/validators/message.chat.validator.js";
import { ChatErrorCode } from "@/rooms/chat/types/chat-error-code.type.js";
import { ChatClientMessage } from "@/rooms/chat/types/chat-message.type.js";

@SdkMessage({ errors: [ChatErrorCode.CHAT_NOT_IN_MAP] })
export class SendGeneralChatCommand extends SendChatCommand<typeof ChatSendSchema> {
    static readonly message = ChatClientMessage.SEND_GENERAL;

    protected override readonly validateSchema = ChatSendSchema;
    protected readonly channelKey = ChatChannelKey.GENERAL;
}
