/** Kết quả thành công của `friendRequest` / `friendAccept` (`FriendNoticeMessage.notice`). Lỗi là `Result` thất bại với `FRIEND_*`. */
export enum FriendNotice {
    /** Lời mời đã gửi, chờ người kia trả lời. */
    REQUEST_SENT = "request_sent",
    /** Hai người đã là bạn (chấp nhận lời mời, hoặc người kia đã mời bạn trước đó). */
    FRIEND_ADDED = "friend_added",
}
