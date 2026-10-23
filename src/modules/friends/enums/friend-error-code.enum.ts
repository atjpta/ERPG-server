import { registerErrorCodes } from "@/core/utils/error-code.util.js";

/** Mã lỗi riêng của friend (global room). */
export enum FriendErrorCode {
    /** Không tìm thấy người chơi với tên đó (cũng trả khi người đó đã chặn bạn). */
    FRIEND_TARGET_NOT_FOUND = "FRIEND_TARGET_NOT_FOUND",
    /** Không thể áp dụng lên chính mình. */
    FRIEND_SELF_TARGET = "FRIEND_SELF_TARGET",
    /** Hai người đã là bạn. */
    FRIEND_ALREADY_FRIENDS = "FRIEND_ALREADY_FRIENDS",
    /** Bạn đã gửi lời mời cho người này và đang chờ trả lời. */
    FRIEND_REQUEST_EXISTS = "FRIEND_REQUEST_EXISTS",
    /** Không có lời mời còn hạn từ người này (hết hạn hoặc đã bị huỷ). */
    FRIEND_NO_REQUEST = "FRIEND_NO_REQUEST",
    /** Người này không phải bạn của bạn. */
    FRIEND_NOT_FRIEND = "FRIEND_NOT_FRIEND",
    /** Danh sách bạn của bạn đã đầy. `error.max` là số bạn tối đa. */
    FRIEND_LIST_FULL = "FRIEND_LIST_FULL",
    /** Danh sách bạn của người kia đã đầy. */
    FRIEND_TARGET_LIST_FULL = "FRIEND_TARGET_LIST_FULL",
    /** Bạn đang có quá nhiều lời mời đã gửi chưa được trả lời. `error.max` là số tối đa. */
    FRIEND_TOO_MANY_SENT = "FRIEND_TOO_MANY_SENT",
    /** Người kia đang có quá nhiều lời mời chưa trả lời. */
    FRIEND_TARGET_TOO_MANY_PENDING = "FRIEND_TARGET_TOO_MANY_PENDING",
    /** Bạn đang chặn người này — bỏ chặn trước. */
    FRIEND_BLOCKED_BY_YOU = "FRIEND_BLOCKED_BY_YOU",
    /** Danh sách chặn của bạn đã đầy. `error.max` là số người tối đa. */
    FRIEND_BLOCK_LIST_FULL = "FRIEND_BLOCK_LIST_FULL",
    /** Người này không nằm trong danh sách chặn của bạn. */
    FRIEND_NOT_BLOCKED = "FRIEND_NOT_BLOCKED",
}

registerErrorCodes(FriendErrorCode);
