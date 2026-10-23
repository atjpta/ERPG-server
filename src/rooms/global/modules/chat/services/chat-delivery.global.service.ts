import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import { generateEntityId } from "@/core/entities/base.entity.js";
import { cacheService } from "@/core/cache/cache.service.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import type { ChatMessageWithSender } from "@/modules/chat/entities/chat-message.entity.js";
import { chatMessageService } from "@/modules/chat/services/chat-message.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import { chatChannelRegistry } from "@/rooms/global/modules/chat/channels/chat-channel.registry.js";
import type { ChatSendPayload } from "@/rooms/global/modules/chat/types/chat-send.type.js";
import { ChatErrorCode } from "@/rooms/global/modules/chat/enums/chat-error-code.enum.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import type {
    ChatHistoryMessage,
    ChatReceivedMessage,
} from "@/rooms/global/modules/chat/interfaces/chat.global.message.js";
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
    /** Gửi một tin vào kênh. Trả `ok()` khi đã gửi, hoặc `fail(code)` lý do bị từ chối (cho response của request). */
    async send(params: {
        room: GlobalRoom;
        senderId: string;
        channelKey: ChatChannelKey;
        payload: ChatSendPayload;
    }): Promise<Result> {
        const { room, senderId, channelKey, payload } = params;

        const config = masterDataCacheService.get(MasterDataKey.CHAT_CONFIG).channels[channelKey];
        const channel = chatChannelRegistry.get(channelKey);
        if (!config?.enabled || !channel)
            return Response.error(ChatErrorCode.CHAT_CHANNEL_DISABLED);

        const content = payload.content.trim();
        if (!content) return Response.error(ChatErrorCode.CHAT_EMPTY);
        if (content.length > config.maxLength) {
            return Response.error(ChatErrorCode.CHAT_TOO_LONG, undefined, {
                maxLength: config.maxLength,
            });
        }

        const { limit, windowSeconds } = config.rateLimit;
        const count = await cacheService.incr(`chat:rate:${channelKey}:${senderId}`, windowSeconds);
        if (count > limit) {
            return Response.error(CommonCode.TOO_MANY_REQUESTS, undefined, {
                retryAfterSeconds: windowSeconds,
            });
        }

        const resolved = await channel.resolveRecipients({
            room,
            senderId,
            payload: { ...payload, content },
        });
        if (Response.isError(resolved)) return resolved;

        const { playerIds, everyone, scopeKey, targetPlayerId } = resolved.data;
        const senderName = room.runtime.players.get(senderId)?.name ?? "";
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
        if (everyone) {
            room.broadcastSuccess(GlobalMessage.CHAT_RECEIVED, message);
        } else {
            for (const playerId of new Set([...playerIds, senderId])) {
                room.clientOf(playerId)?.sendSuccess(GlobalMessage.CHAT_RECEIVED, message);
            }
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
        return Response.success();
    }

    /**
     * Một trang lịch sử của kênh cho `playerId` (cũ → mới). Kênh không lưu DB / không bật thì trả trang rỗng.
     * `before` là `id` của tin cũ nhất client đang có (loadmore); không có = trang mới nhất, cỡ `historyOnJoin`
     * (xin lúc vào game); có `before` thì cỡ `historyPageSize`.
     */
    async history(params: {
        room: GlobalRoom;
        playerId: string;
        channelKey: ChatChannelKey;
        before?: string;
    }): Promise<ChatHistoryMessage> {
        const { room, playerId, channelKey, before } = params;
        const empty: ChatHistoryMessage = { channel: channelKey, messages: [], hasMore: false };
        const config = masterDataCacheService.get(MasterDataKey.CHAT_CONFIG).channels[channelKey];
        const channel = chatChannelRegistry.get(channelKey);
        if (!config?.enabled || !config.saveHistory || !channel) return empty;
        const pageSize = before ? config.historyPageSize : config.historyOnJoin;
        if (pageSize <= 0) return empty;

        // Lấy dư 1 dòng để biết còn tin cũ hơn không.
        const limit = pageSize + 1;
        const rows = channel.loadHistory
            ? await channel.loadHistory({ room, playerId, before, limit })
            : await chatMessageService.findRecentByChannel({
                  serverId: room.serverId,
                  channel: channelKey,
                  before,
                  limit,
              });
        return {
            channel: channelKey,
            messages: rows.slice(0, pageSize).map(toReceived).reverse(),
            hasMore: rows.length > pageSize,
        };
    }
}

export const chatDeliveryService = new ChatDeliveryService();
