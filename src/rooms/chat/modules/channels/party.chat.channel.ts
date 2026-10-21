import { callRoom } from "@/core/rooms/room.integration.js";
import { fail, isFail, ok } from "@/core/utils/result.util.js";
import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import type {
    ChatChannel,
    ChatChannelContext,
} from "@/rooms/chat/modules/channels/chat-channel.type.js";
import { ChatErrorCode } from "@/rooms/chat/types/chat-error-code.type.js";
import { ListMembersPartyCommand } from "@/rooms/party/modules/members/commands/list-members.party.command.js";
import { partyDirectoryService } from "@/rooms/party/party.shared.js";

/** Thành viên cùng party với người gửi (party room là nguồn sự thật về thành viên). */
export const partyChatChannel: ChatChannel = {
    key: ChatChannelKey.PARTY,
    async resolveRecipients({ senderId }: ChatChannelContext) {
        const partyRoomId = await partyDirectoryService.getPartyRoomId(senderId);
        if (!partyRoomId) return fail(ChatErrorCode.CHAT_NOT_IN_PARTY);
        const members = await callRoom(partyRoomId, ListMembersPartyCommand, {});
        if (isFail(members)) return members;
        if (!members.data.playerIds.includes(senderId))
            return fail(ChatErrorCode.CHAT_NOT_IN_PARTY);
        return ok({ playerIds: members.data.playerIds, scopeKey: partyRoomId });
    },
};
