import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import { SendChatCommand } from "@/rooms/chat/modules/messages/commands/send.chat.command.js";
import { ChatSendSchema } from "@/rooms/chat/modules/messages/validators/message.chat.validator.js";
import { ChatClientMessage } from "@/rooms/chat/types/chat-message.type.js";

export class SendWorldChatCommand extends SendChatCommand<typeof ChatSendSchema> {
    static readonly message = ChatClientMessage.SEND_WORLD;

    protected override readonly validateSchema = ChatSendSchema;
    protected readonly channelKey = ChatChannelKey.WORLD;
}
