import { z } from "zod";

/** Options khi join chat room: mỗi `serverId` một room (`filterBy`); phải khớp `serverId` trong token. */
export const ChatJoinOptionsSchema = z.object({
    serverId: z.string().min(1).max(64),
});
export type ChatJoinOptions = z.infer<typeof ChatJoinOptionsSchema>;

/** Payload chung mọi lệnh gửi tin (đã parse): `targetName` chỉ dùng cho whisper. */
export interface ChatSendPayload {
    content: string;
    targetName?: string;
}
