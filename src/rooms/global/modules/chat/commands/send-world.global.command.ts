import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import { SendChatCommand } from "@/rooms/global/modules/chat/commands/send.global.command.js";
import { ChatSendSchema } from "@/rooms/global/modules/chat/validators/message.chat.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";

export class SendWorldChatCommand extends SendChatCommand<typeof ChatSendSchema> {
    static readonly message = GlobalClientMessage.SEND_WORLD;

    protected override readonly validateSchema = ChatSendSchema;
    protected readonly channelKey = ChatChannelKey.WORLD;
}
