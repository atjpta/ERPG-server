import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import { generateEntityId } from "@/core/entities/base.entity.js";
import { cacheService } from "@/core/cache/cache.service.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { isFail } from "@/core/utils/result.util.js";
import type { ChatMessageWithSender } from "@/modules/chat/entities/chat-message.entity.js";
import { chatMessageService } from "@/modules/chat/services/chat-message.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import type { ChatRoom } from "@/rooms/chat/chat.room.js";
import { chatChannelRegistry } from "@/rooms/chat/modules/channels/chat-channel.registry.js";
import { ChatErrorCode } from "@/rooms/chat/types/chat-error-code.type.js";
import {
    ChatMessage,
    type ChatHistoryMessage,
    type ChatReceivedMessage,
} from "@/rooms/chat/types/chat-message.type.js";
import type { ChatSendPayload } from "@/rooms/chat/types/chat-room.type.js";
import { DateTime } from "luxon";

const toReceived = (row: ChatMessageWithSender): ChatReceivedMessage => ({
    id: row.id,
    channel: row.channel,
    senderId: row.senderPlayerId,
    senderName: row.senderName,
    content: row.content,
    sentAt: row.createdAt.getTime(),
    ...(row.targetPlayerId ? { targetId: row.targetPlayerId } : {}),
});

/**
 * Phần chung của mọi kênh: kiểm tra (bật/tắt, rỗng, độ dài, rate limit) → hỏi kênh ai nhận → gửi → lưu DB
 * nếu kênh bật `saveHistory`. Mọi giới hạn đọc từ `chat_config.channels[key]`; kênh chỉ quyết định người nhận.
 */
export class ChatDeliveryService {
    async send(params: {
        room: ChatRoom;
        client: PlayerClient;
        channelKey: ChatChannelKey;
        payload: ChatSendPayload;
    }) {
        const { room, client, channelKey, payload } = params;
        const reply = (code: string, error?: Record<string, unknown>) =>
            client.sendError(ChatMessage.SEND_RESULT, code, error);

        const config = masterDataCacheService.get(MasterDataKey.CHAT_CONFIG).channels[channelKey];
        const channel = chatChannelRegistry.get(channelKey);
        if (!config?.enabled || !channel) return reply(ChatErrorCode.CHAT_CHANNEL_DISABLED);

        const content = payload.content.trim();
        if (!content) return reply(ChatErrorCode.CHAT_EMPTY);
        if (content.length > config.maxLength) {
            return reply(ChatErrorCode.CHAT_TOO_LONG, { maxLength: config.maxLength });
        }

        const senderId = client.auth.playerId;
        const { limit, windowSeconds } = config.rateLimit;
        const count = await cacheService.incr(`chat:rate:${channelKey}:${senderId}`, windowSeconds);
        if (count > limit) {
            return reply(CommonCode.TOO_MANY_REQUESTS, { retryAfterSeconds: windowSeconds });
        }

        const resolved = await channel.resolveRecipients({
            room,
            senderId,
            payload: { ...payload, content },
        });
        if (isFail(resolved)) return client.sendResult(ChatMessage.SEND_RESULT, resolved);

        const { playerIds, scopeKey, targetPlayerId } = resolved.data;
        const senderName = room.profileOf.get(senderId)?.name ?? "";
        const id = generateEntityId();
        const message: ChatReceivedMessage = {
            id,
            channel: channelKey,
            senderId,
            senderName,
            content,
            sentAt: DateTime.now().toMillis(),
            ...(targetPlayerId ? { targetId: targetPlayerId } : {}),
        };
        for (const playerId of new Set([...playerIds, senderId])) {
            const sessionId = room.sessionOf.get(playerId);
            room.clients.get(sessionId)?.sendSuccess(ChatMessage.RECEIVED, message);
        }

        if (config.saveHistory) {
            // Không chặn việc gửi: lỗi DB chỉ làm mất dòng lịch sử, tin đã tới người nhận.
            chatMessageService
                .create({
                    data: {
                        id,
                        serverId: room.serverId,
                        channel: channelKey,
                        senderPlayerId: senderId,
                        targetPlayerId: targetPlayerId ?? null,
                        scopeKey: scopeKey ?? null,
                        content,
                    },
                })
                .catch((error: unknown) => console.warn("[Chat] save history failed:", error));
        }
    }

    /**
     * Gửi một trang lịch sử của kênh cho `client` (cũ → mới). Kênh không lưu DB / không bật thì thôi.
     * `before` là `id` của tin cũ nhất client đang có (loadmore); không có = trang mới nhất. `onJoin` dùng
     * `historyOnJoin` làm cỡ trang, còn lại dùng `historyPageSize`.
     */
    async sendHistory(params: {
        room: ChatRoom;
        client: PlayerClient;
        channelKey: ChatChannelKey;
        before?: string;
        onJoin?: boolean;
    }) {
        const { room, client, channelKey, before } = params;
        const config = masterDataCacheService.get(MasterDataKey.CHAT_CONFIG).channels[channelKey];
        const channel = chatChannelRegistry.get(channelKey);
        if (!config?.enabled || !config.saveHistory || !channel) return;
        const pageSize = params.onJoin ? config.historyOnJoin : config.historyPageSize;
        if (pageSize <= 0) return;

        // Lấy dư 1 dòng để biết còn tin cũ hơn không.
        const limit = pageSize + 1;
        const playerId = client.auth.playerId;
        const rows = channel.loadHistory
            ? await channel.loadHistory({ room, playerId, before, limit })
            : await chatMessageService.findRecentByChannel({
                  serverId: room.serverId,
                  channel: channelKey,
                  before,
                  limit,
              });
        const history: ChatHistoryMessage = {
            channel: channelKey,
            messages: rows.slice(0, pageSize).map(toReceived).reverse(),
            hasMore: rows.length > pageSize,
        };
        client.sendSuccess(ChatMessage.HISTORY, history);
    }
}

export const chatDeliveryService = new ChatDeliveryService();
