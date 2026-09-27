import { matchMaker } from "colyseus";
import { env } from "@/configs/env.config.js";

/**
 * Giới hạn origin gọi API từ trình duyệt. Colyseus mặc định `Access-Control-Allow-Origin: *`
 * (kèm credentials) cho cả REST lẫn matchmaking → override `getCorsHeaders` theo `CORS_ORIGINS`.
 * Request không có `Origin` (client Unity, server-to-server) giữ nguyên mặc định.
 */
export function applyCorsPolicy() {
    if (env.CORS_ORIGINS.length === 0) {
        if (env.NODE_ENV === "production") {
            console.warn("[CORS] CORS_ORIGINS is empty — every browser origin is allowed");
        }
        return;
    }

    const allowed = new Set(env.CORS_ORIGINS);
    matchMaker.controller.getCorsHeaders = (headers: Headers) => {
        const origin = headers.get("origin");
        if (!origin) return {};
        // Origin lạ → trả origin hợp lệ đầu tiên, trình duyệt sẽ tự chặn response.
        return {
            "Access-Control-Allow-Origin": allowed.has(origin) ? origin : env.CORS_ORIGINS[0],
            Vary: "Origin",
        };
    };
}
