import { registerErrorCodes } from "@/core/utils/error-code.util.js";

/** Mã lỗi tài khoản, đăng nhập, admin và game server. */
export enum AuthErrorCode {
    /** Email đã được dùng bởi tài khoản khác (đăng ký, hoặc liên kết Google trùng email tài khoản mật khẩu). */
    AUTH_EMAIL_EXISTS = "AUTH_EMAIL_EXISTS",
    /** Sai email hoặc mật khẩu. */
    AUTH_INVALID_CREDENTIALS = "AUTH_INVALID_CREDENTIALS",
    /** Tài khoản đang bị khoá (ban). Hiện thông báo bị khoá; không đăng nhập được. */
    AUTH_ACCOUNT_BANNED = "AUTH_ACCOUNT_BANNED",
    /** Tài khoản chưa kích hoạt / không ở trạng thái hoạt động. */
    AUTH_ACCOUNT_INACTIVE = "AUTH_ACCOUNT_INACTIVE",
    /** Phiên đăng nhập không còn (đã đăng xuất / bị thu hồi). Đưa người chơi về màn đăng nhập. */
    AUTH_SESSION_NOT_FOUND = "AUTH_SESSION_NOT_FOUND",
    /** Tài khoản đã bị xoá. */
    AUTH_ACCOUNT_DELETED = "AUTH_ACCOUNT_DELETED",
    /** Không có yêu cầu xoá tài khoản này (admin). */
    ACCOUNT_DELETION_REQUEST_NOT_FOUND = "ACCOUNT_DELETION_REQUEST_NOT_FOUND",
    /** Yêu cầu xoá tài khoản đã được xử lý trước đó (admin). */
    ACCOUNT_DELETION_REQUEST_PROCESSED = "ACCOUNT_DELETION_REQUEST_PROCESSED",
    /** Cách đăng nhập (Google / Play Games) đang tắt trên server. */
    OAUTH_PROVIDER_DISABLED = "OAUTH_PROVIDER_DISABLED",
    /** idToken / serverAuthCode / nonce không hợp lệ hoặc hết hạn. Xin lại token từ Google rồi thử lại. */
    OAUTH_INVALID_CREDENTIAL = "OAUTH_INVALID_CREDENTIAL",
    /** Google / Play Games lỗi hoặc không phản hồi (HTTP 502). Thử lại sau. */
    OAUTH_PROVIDER_ERROR = "OAUTH_PROVIDER_ERROR",
    /** Tài khoản Google này đã được liên kết với một tài khoản game khác (HTTP 409) — không thể liên kết lại. */
    OAUTH_ACCOUNT_LINKED_ELSEWHERE = "OAUTH_ACCOUNT_LINKED_ELSEWHERE",
    /** Tài khoản game này đã liên kết một tài khoản Google khác (HTTP 409) — mỗi tài khoản chỉ liên kết một Google. */
    OAUTH_ALREADY_LINKED = "OAUTH_ALREADY_LINKED",
    /** Sai thông tin đăng nhập admin. */
    ADMIN_INVALID_CREDENTIALS = "ADMIN_INVALID_CREDENTIALS",
    /** Cần quyền admin cho thao tác này. */
    ADMIN_ACCESS_REQUIRED = "ADMIN_ACCESS_REQUIRED",
    /** Mã game server đã tồn tại (admin). */
    GAME_SERVER_CODE_EXISTS = "GAME_SERVER_CODE_EXISTS",
    /** Game server đang bảo trì / không có server online để vào (HTTP 503). */
    GAME_SERVER_UNAVAILABLE = "GAME_SERVER_UNAVAILABLE",
}

registerErrorCodes(AuthErrorCode);
