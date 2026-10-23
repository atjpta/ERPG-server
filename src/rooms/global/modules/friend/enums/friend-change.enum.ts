/** Loại thay đổi trong push `GlobalMessage.FRIEND_CHANGED`. */
export enum FriendChange {
    /** Có người vừa thành bạn của bạn (`friend` có đủ thông tin). */
    ADDED = "added",
    /** Người này không còn là bạn / lời mời với họ không còn nữa (xoá bạn, chặn, huỷ lời mời): bỏ khỏi mọi danh sách. */
    REMOVED = "removed",
    /** Có người gửi lời mời kết bạn cho bạn. */
    REQUEST_RECEIVED = "request_received",
}
