import { worldRegistryGlobalService } from "@/rooms/global/modules/world-registry/services/world-registry.global.service.js";
import { Response } from "@/core/utils/response.util.js";
import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import type {
    ChatChannel,
    ChatChannelContext,
} from "@/rooms/global/modules/chat/channels/chat-channel.type.js";
import { ChatErrorCode } from "@/rooms/global/modules/chat/enums/chat-error-code.enum.js";

/**
 * Chat local: những người cùng map với người gửi (cùng `mapCode`, và cùng instance nếu là dungeon), theo
 * presence mà world room báo lên global room.
 */
export const generalChatChannel: ChatChannel = {
    key: ChatChannelKey.GENERAL,
    async resolveRecipients({ room, senderId }: ChatChannelContext) {
        const playerIds = worldRegistryGlobalService.playersOnSameMap(room, senderId);
        if (!playerIds.includes(senderId)) return Response.error(ChatErrorCode.CHAT_NOT_IN_MAP);
        return Response.success({ playerIds });
    },
};
