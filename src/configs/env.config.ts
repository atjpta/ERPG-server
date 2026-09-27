const required = (key: string): string => {
    const value = process.env[key];
    if (!value) throw new Error(`Missing required env variable: ${key}`);
    return value;
};

const list = (key: string): string[] =>
    (process.env[key] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

export const env = {
    NODE_ENV: process.env.NODE_ENV ?? "development",
    PORT: Number(process.env.PORT ?? 2567),
    POSTGRES_URI: required("POSTGRES_URI"),
    /**
     * Không bắt buộc ở 1 process. Có giá trị → bật RedisDriver + RedisPresence (scale nhiều process)
     * và chuyển `cacheService` sang Redis (nonce OAuth, rate limit dùng chung giữa các process).
     */
    REDIS_URI: process.env.REDIS_URI,
    JWT_SECRET: process.env.JWT_SECRET ?? "JWT_SECRET",
    /** Secret riêng cho admin — token user không bao giờ verify lọt được qua middleware admin. */
    ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET ?? "ADMIN_JWT_SECRET",
    /**
     * Web Client ID (loại "Web application" trên Google Cloud Console, cùng project với Play Games).
     * Dùng cho: đổi `serverAuthCode` của Play Games Services v2 và làm `aud` của idToken.
     */
    GOOGLE_WEB_CLIENT_ID: process.env.GOOGLE_WEB_CLIENT_ID ?? "",
    /** Client Secret của Web Client ID — bắt buộc để đổi `serverAuthCode` (Play Games). */
    GOOGLE_WEB_CLIENT_SECRET: process.env.GOOGLE_WEB_CLIENT_SECRET ?? "",
    /**
     * Client ID khác được chấp nhận làm `aud` của Google idToken (vd Desktop Client ID của bản PC),
     * ngoài `GOOGLE_WEB_CLIENT_ID`. Phân tách bằng dấu phẩy.
     */
    GOOGLE_EXTRA_CLIENT_IDS: list("GOOGLE_EXTRA_CLIENT_IDS"),
    /**
     * Origin được phép gọi API từ trình duyệt (trang admin, trang xoá tài khoản...). Rỗng = cho phép
     * mọi origin (chỉ nên dùng ở dev). Client Unity không gửi `Origin` nên không bị ảnh hưởng.
     */
    CORS_ORIGINS: list("CORS_ORIGINS"),
    /**
     * `true` khi chạy sau reverse proxy (Nginx/Cloudflare...) — lấy IP client từ `CF-Connecting-IP` /
     * `X-Real-IP` / `X-Forwarded-For` để rate limit. `false` thì không tin các header này
     * (client tự giả được) và gộp mọi request vào chung 1 bucket.
     */
    TRUST_PROXY: process.env.TRUST_PROXY === "true",
    /** URL public của server — dùng để tạo link trang xoá tài khoản khai báo trên Google Play. */
    PUBLIC_URL: process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 2567}`,
} as const;

/** Mọi Client ID chấp nhận làm `aud` của Google idToken. */
export const googleIdTokenAudiences = () =>
    [env.GOOGLE_WEB_CLIENT_ID, ...env.GOOGLE_EXTRA_CLIENT_IDS].filter(Boolean);
