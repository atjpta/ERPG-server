import { Response } from "@/core/response/response.js";
import { playerBlockService } from "@/modules/friends/services/player-block.service.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { chatMessageService } from "@/modules/chat/services/chat-message.service.js";
import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import type {
    ChatChannel,
    ChatChannelContext,
} from "@/rooms/global/modules/chat/channels/chat-channel.type.js";
import { ChatErrorCode } from "@/modules/chat/enums/chat-error-code.enum.js";

/** Nhắn riêng: người nhận (tra theo tên trong cùng server) + người gửi nhận bản echo. */
export const whisperChatChannel: ChatChannel = {
    key: ChatChannelKey.WHISPER,
    async resolveRecipients({ room, senderId, payload }: ChatChannelContext) {
        const target = await PlayerIdentityRepo.findByServerAndName({
            serverId: room.serverId,
            name: payload.targetName ?? "",
        });
        if (!target) return Response.error(ChatErrorCode.CHAT_TARGET_NOT_FOUND);
        if (target.id === senderId) return Response.error(ChatErrorCode.CHAT_TARGET_SELF);
        // Chặn nhau (một trong hai chiều): coi như không tìm thấy, không lộ việc bị chặn.
        if (await playerBlockService.isBlockedEitherWay(senderId, target.id)) {
            return Response.error(ChatErrorCode.CHAT_TARGET_NOT_FOUND);
        }
        if (!room.sessionOf.has(target.id))
            return Response.error(ChatErrorCode.CHAT_TARGET_OFFLINE);
        return Response.success({ playerIds: [target.id, senderId], targetPlayerId: target.id });
    },
    /** Chỉ whisper người đó gửi hoặc nhận. */
    loadHistory({ playerId, before, limit }) {
        return chatMessageService.findRecentWhispers({ playerId, before, limit });
    },
};
