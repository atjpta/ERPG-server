import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import { SendChatCommand } from "@/rooms/global/modules/chat/commands/send.global.command.js";
import { ChatSendSchema } from "@/rooms/global/modules/chat/validators/message.chat.validator.js";
import { ChatErrorCode } from "@/modules/chat/enums/chat-error-code.enum.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";

@SdkMessage({ errors: [ChatErrorCode.CHAT_NOT_IN_PARTY] })
export class SendPartyChatCommand extends SendChatCommand<typeof ChatSendSchema> {
    static readonly message = GlobalClientMessage.SEND_PARTY;

    protected override readonly validateSchema = ChatSendSchema;
    protected readonly channelKey = ChatChannelKey.PARTY;
}
