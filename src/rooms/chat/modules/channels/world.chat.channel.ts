import { ok } from "@/core/utils/result.util.js";
import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import type {
    ChatChannel,
    ChatChannelContext,
} from "@/rooms/chat/modules/channels/chat-channel.type.js";

/** Cả server: mọi người đang kết nối chat room của server. */
export const worldChatChannel: ChatChannel = {
    key: ChatChannelKey.WORLD,
    async resolveRecipients({ room }: ChatChannelContext) {
        return ok({ playerIds: [...room.sessionOf.keys()] });
    },
};
