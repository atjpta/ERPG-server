/** Payload chung mọi lệnh gửi tin (đã parse): `targetName` chỉ dùng cho whisper. */
export interface ChatSendPayload {
    content: string;
    targetName?: string;
}
