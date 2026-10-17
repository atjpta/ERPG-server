/** Lý do đá player khỏi room realtime — room map sang close code gửi về client. */
export enum KickReason {
    /** Cùng player vừa vào game ở kết nối khác (máy khác / room khác / process khác). */
    DUPLICATE_LOGIN = "duplicate_login",
    /** Tài khoản hoặc player bị ban. */
    BANNED = "banned",
    /** Tài khoản đã bị xoá. */
    ACCOUNT_DELETED = "account_deleted",
    /** Session bị thu hồi (logout, force logout, đăng nhập máy khác khi bật single session). */
    SESSION_REVOKED = "session_revoked",
    /** Player data was edited by an administrator; reconnect to load the updated snapshot. */
    PLAYER_UPDATED = "player_updated",
}
