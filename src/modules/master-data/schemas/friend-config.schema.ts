import { z } from "zod";

/** Master data `friend_config`. */
export const FriendConfigSchema = z.object({
    /** Số bạn tối đa của mỗi người chơi. */
    maxFriends: z.number().int().min(1).max(500),
    /** Số lời mời đã gửi mà chưa được trả lời tối đa của mỗi người. */
    maxPendingSent: z.number().int().min(1),
    /** Số lời mời chưa trả lời tối đa mà một người có thể nhận cùng lúc (chống bị spam lời mời). */
    maxPendingReceived: z.number().int().min(1),
    /** Số người chơi tối đa trong danh sách chặn. */
    maxBlocked: z.number().int().min(1),
    /** Lời mời kết bạn hết hạn sau chừng này ngày. */
    requestTtlDays: z.number().int().positive(),
    /** Mỗi người gửi tối đa `limit` lời mời / `windowSeconds` giây. */
    requestRateLimit: z.object({
        limit: z.number().int().positive(),
        windowSeconds: z.number().int().positive(),
    }),
});
export type FriendConfig = z.infer<typeof FriendConfigSchema>;
