import { z } from "zod";

/** Chỉ người chơi theo tên (gửi lời mời, chặn). */
export const FriendNameSchema = z.object({ playerName: z.string().trim().min(1).max(32) });
/** Chỉ người chơi theo id (trả lời lời mời, xoá bạn, bỏ chặn). */
export const FriendTargetSchema = z.object({ playerId: z.string().min(1).max(64) });
