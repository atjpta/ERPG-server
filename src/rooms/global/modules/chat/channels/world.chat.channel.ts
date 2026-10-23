import { Response } from "@/core/utils/response.util.js";
import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import type { ChatChannel } from "@/rooms/global/modules/chat/channels/chat-channel.type.js";

/** Cả server: mọi người đang kết nối global room của server (một lần broadcast). */
export const worldChatChannel: ChatChannel = {
    key: ChatChannelKey.WORLD,
    async resolveRecipients() {
        return Response.success({ playerIds: [], everyone: true });
    },
};
