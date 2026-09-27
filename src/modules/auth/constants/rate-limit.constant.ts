import type { RateLimitRule } from "@/core/utils/rate-limit.util.js";

/** Giới hạn theo IP cho các endpoint đăng ký/đăng nhập của người chơi. */
export const AUTH_IP_RATE_LIMIT: RateLimitRule = {
    name: "auth-ip",
    limit: 30,
    windowSeconds: 60,
};

/** Giới hạn số lần thử mật khẩu theo email — chống dò mật khẩu dù đổi IP. */
export const AUTH_LOGIN_EMAIL_RATE_LIMIT: RateLimitRule = {
    name: "auth-login-email",
    limit: 10,
    windowSeconds: 15 * 60,
};

export const ADMIN_LOGIN_IP_RATE_LIMIT: RateLimitRule = {
    name: "admin-login-ip",
    limit: 10,
    windowSeconds: 60,
};

export const ADMIN_LOGIN_EMAIL_RATE_LIMIT: RateLimitRule = {
    name: "admin-login-email",
    limit: 5,
    windowSeconds: 15 * 60,
};

/** Form xoá tài khoản trên web (public, không cần đăng nhập). */
export const ACCOUNT_DELETION_WEB_RATE_LIMIT: RateLimitRule = {
    name: "account-deletion-web",
    limit: 5,
    windowSeconds: 60 * 60,
};
