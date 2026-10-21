import { fail, ok } from "@/core/utils/result.util.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { chatMessageService } from "@/modules/chat/services/chat-message.service.js";
import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import type {
    ChatChannel,
    ChatChannelContext,
} from "@/rooms/chat/modules/channels/chat-channel.type.js";
import { ChatErrorCode } from "@/rooms/chat/types/chat-error-code.type.js";

/** Nhắn riêng: người nhận (tra theo tên trong cùng server) + người gửi nhận bản echo. */
export const whisperChatChannel: ChatChannel = {
    key: ChatChannelKey.WHISPER,
    async resolveRecipients({ room, senderId, payload }: ChatChannelContext) {
        const target = await PlayerIdentityRepo.findByServerAndName({
            serverId: room.serverId,
            name: payload.targetName ?? "",
        });
        if (!target) return fail(ChatErrorCode.CHAT_TARGET_NOT_FOUND);
        if (target.id === senderId) return fail(ChatErrorCode.CHAT_TARGET_SELF);
        if (!room.sessionOf.has(target.id)) return fail(ChatErrorCode.CHAT_TARGET_OFFLINE);
        return ok({ playerIds: [target.id, senderId], targetPlayerId: target.id });
    },
    /** Chỉ whisper người đó gửi hoặc nhận. */
    loadHistory({ playerId, before, limit }) {
        return chatMessageService.findRecentWhispers({ playerId, before, limit });
    },
};
