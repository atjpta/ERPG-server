import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import type { Response } from "@/core/response/response.js";
import type { ChatMessageWithSender } from "@/modules/chat/entities/chat-message.entity.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import type { ChatSendPayload } from "@/rooms/global/modules/chat/types/chat-send.type.js";

/** Người nhận của một tin + thông tin phạm vi để lưu DB. Người gửi luôn được gửi kèm (xem delivery). */
export interface ChatRecipients {
    /** `playerId` được nhận; người không có kết nối global sẽ tự bị bỏ qua. */
    playerIds: string[];
    /** Gửi cho mọi kết nối của room bằng một lần `broadcast` (kênh cả server) thay vì từng người; bỏ qua `playerIds`. */
    everyone?: boolean;
    /** Phạm vi của kênh (vd guild id) — lưu vào `chat_messages.scope_key`; bỏ trống = không có. */
    scopeKey?: string;
    /** Whisper: người nhận trực tiếp. */
    targetPlayerId?: string;
}

export interface ChatChannelContext {
    room: GlobalRoom;
    senderId: string;
    payload: ChatSendPayload;
}

/**
 * Một kênh chat. Chỉ trả lời câu hỏi "ai nhận tin này?"; mọi thứ còn lại (độ dài, rate limit, lưu DB,
 * đóng gói message) là chung và đọc từ `chat_config.channels[key]` — xem `ChatDeliveryService`.
 */
export interface ChatChannel {
    readonly key: ChatChannelKey;
    /** Thất bại: `fail(ChatErrorCode.X)` — tin không được gửi. */
    resolveRecipients(ctx: ChatChannelContext): Promise<Response<ChatRecipients>>;
    /**
     * Lịch sử gửi cho `playerId` (mới → cũ). Chỉ gọi khi kênh có `saveHistory`; bỏ trống = lấy các tin gần nhất
     * của kênh trong server (không phạm vi), như world.
     */
    loadHistory?(params: {
        room: GlobalRoom;
        playerId: string;
        /** `id` của tin cũ nhất client đang có (loadmore); bỏ trống = từ tin mới nhất. */
        before?: string;
        limit: number;
    }): Promise<ChatMessageWithSender[]>;
}
