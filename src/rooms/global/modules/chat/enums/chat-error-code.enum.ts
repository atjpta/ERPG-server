import { registerErrorCodes } from "@/core/utils/error-code.util.js";

/** Mã lỗi riêng của chat (global room). */
export enum ChatErrorCode {
    /** Kênh chat này đang tắt hoặc không tồn tại. */
    CHAT_CHANNEL_DISABLED = "CHAT_CHANNEL_DISABLED",
    /** Tin rỗng (sau khi bỏ khoảng trắng đầu / cuối). */
    CHAT_EMPTY = "CHAT_EMPTY",
    /** Tin quá dài. `error.maxLength` là số ký tự tối đa của kênh. */
    CHAT_TOO_LONG = "CHAT_TOO_LONG",
    /** Bạn đang không ở trong party nào. */
    CHAT_NOT_IN_PARTY = "CHAT_NOT_IN_PARTY",
    /** Bạn đang không đứng trong map nào (đang chuyển map hoặc chưa vào thế giới). */
    CHAT_NOT_IN_MAP = "CHAT_NOT_IN_MAP",
    /** Không tìm thấy người chơi với tên đó. */
    CHAT_TARGET_NOT_FOUND = "CHAT_TARGET_NOT_FOUND",
    /** Người chơi đó đang offline. */
    CHAT_TARGET_OFFLINE = "CHAT_TARGET_OFFLINE",
    /** Không thể nhắn riêng cho chính mình. */
    CHAT_TARGET_SELF = "CHAT_TARGET_SELF",
}

registerErrorCodes(ChatErrorCode);
