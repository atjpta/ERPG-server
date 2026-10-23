import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import { z } from "zod";

/**
 * Chỉ chặn payload bất thường ở đây (trần 1000 ký tự để không xử lý chuỗi khổng lồ); độ dài thật theo
 * từng kênh nằm ở `chat_config` và được kiểm trong `ChatDeliveryService`.
 */
const content = z.string().max(1000);

export const ChatSendSchema = z.object({ content });
export const ChatWhisperSchema = z.object({
    targetName: z.string().trim().min(1).max(32),
    content,
});
export const ChatHistorySchema = z.object({
    channel: z.enum(ChatChannelKey),
    /** `id` (uuid v7) của tin cũ nhất client đang có. */
    before: z.uuid().optional(),
});
