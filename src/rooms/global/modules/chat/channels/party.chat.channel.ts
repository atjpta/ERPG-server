import { Response } from "@/core/response/response.js";
import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import type {
    ChatChannel,
    ChatChannelContext,
} from "@/rooms/global/modules/chat/channels/chat-channel.type.js";
import { ChatErrorCode } from "@/modules/chat/enums/chat-error-code.enum.js";

/** Thành viên cùng party với người gửi (party registry của global room là nguồn sự thật về thành viên). */
export const partyChatChannel: ChatChannel = {
    key: ChatChannelKey.PARTY,
    async resolveRecipients({ room, senderId }: ChatChannelContext) {
        const party = room.parties.getPartyByPlayerId(senderId);
        if (!party) return Response.error(ChatErrorCode.CHAT_NOT_IN_PARTY);
        return Response.success({ playerIds: party.joinOrder, scopeKey: party.id });
    },
};
