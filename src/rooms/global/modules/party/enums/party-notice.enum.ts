/**
 * Thông báo thành công (sự kiện) của party — `data.notice` của `GlobalMessage.PARTY_NOTICE`. Lỗi thao tác không nằm
 * ở đây mà là `Result` thất bại với `ErrorCode` (`PARTY_*`) trong response của request.
 */
export enum PartyNotice {
    INVITE_SENT = "invite_sent",
    INVITE_DECLINED = "invite_declined",
    INVITE_EXPIRED = "invite_expired",
    MEMBER_JOINED = "member_joined",
    MEMBER_LEFT = "member_left",
    KICKED = "kicked",
    LEADER_CHANGED = "leader_changed",
    DISBANDED = "disbanded",
    /** Xin vào party: đã gửi tới chủ party. */
    JOIN_REQUEST_SENT = "join_request_sent",
}
