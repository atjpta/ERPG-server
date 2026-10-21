import { callRoom } from "@/core/rooms/room.integration.js";
import { fail, isFail, ok } from "@/core/utils/result.util.js";
import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import type {
    ChatChannel,
    ChatChannelContext,
} from "@/rooms/chat/modules/channels/chat-channel.type.js";
import { ChatErrorCode } from "@/rooms/chat/types/chat-error-code.type.js";
import { partyDirectoryService } from "@/rooms/party/party.shared.js";
import { ChatListPlayersWorldCommand } from "@/rooms/world/modules/players/commands/chat-list-players.world.command.js";

/**
 * Chat local: những người cùng world room với người gửi (1 world room = 1 kênh của 1 map, hoặc 1 instance
 * dungeon). Hỏi thẳng world room qua RPC nên không cần đồng bộ vị trí vào chat room.
 */
export const generalChatChannel: ChatChannel = {
    key: ChatChannelKey.GENERAL,
    async resolveRecipients({ senderId }: ChatChannelContext) {
        const worldRoomId = await partyDirectoryService.getWorldRoomId(senderId);
        if (!worldRoomId) return fail(ChatErrorCode.CHAT_NOT_IN_MAP);
        const players = await callRoom(worldRoomId, ChatListPlayersWorldCommand, {});
        if (isFail(players)) return players;
        if (!players.data.playerIds.includes(senderId)) return fail(ChatErrorCode.CHAT_NOT_IN_MAP);
        return ok({ playerIds: players.data.playerIds });
    },
};
