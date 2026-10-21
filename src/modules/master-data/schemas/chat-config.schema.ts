import { z } from "zod";

/** Cấu hình một kênh chat trong `chat_config.channels`. */
export const ChatChannelConfigSchema = z.object({
    /** Tắt = server từ chối tin gửi lên kênh này (`CHAT_CHANNEL_DISABLED`). */
    enabled: z.boolean().default(true),
    /** Số ký tự tối đa của một tin (sau khi trim). */
    maxLength: z.number().int().min(1).max(500).default(200),
    /** Mỗi người gửi tối đa `limit` tin / `windowSeconds` giây trên kênh này. */
    rateLimit: z.object({
        limit: z.number().int().positive(),
        windowSeconds: z.number().int().positive(),
    }),
    /** Lưu tin vào DB (`chat_messages`). */
    saveHistory: z.boolean().default(false),
    /** Số tin gần nhất gửi cho người chơi khi vào chat room (cần `saveHistory`). 0 = không gửi. */
    historyOnJoin: z.number().int().min(0).max(100).default(0),
    /** Số tin mỗi lần client xin thêm lịch sử cũ (`getHistory` với `before`; cần `saveHistory`). */
    historyPageSize: z.number().int().min(1).max(100).default(30),
});
export type ChatChannelConfig = z.infer<typeof ChatChannelConfigSchema>;

/** Master data `chat_config`. Kênh không có trong `channels` coi như tắt. */
export const ChatConfigSchema = z.object({
    /** Tin trong DB cũ hơn chừng này ngày bị dọn. */
    retentionDays: z.number().int().positive().default(30),
    /** Khoá theo `ChatChannelKey`; để `string` mở để thêm kênh không phải sửa schema. */
    channels: z.record(z.string().min(1), ChatChannelConfigSchema),
});
export type ChatConfig = z.infer<typeof ChatConfigSchema>;
