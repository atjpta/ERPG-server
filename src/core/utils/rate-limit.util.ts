import { env } from "@/configs/env.config.js";
import { cacheService } from "@/core/cache/cache.service.js";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { serviceError } from "@/core/utils/service-error.js";

export interface RateLimitRule {
    /** Tên bucket — phân biệt các giới hạn khác nhau (vd `auth-login-ip`). */
    name: string;
    /** Số lần tối đa trong 1 cửa sổ. */
    limit: number;
    windowSeconds: number;
}

/**
 * Fixed-window rate limit qua `cacheService.incr` (Redis khi có `REDIS_URI` → dùng chung mọi process).
 * Vượt giới hạn → `serviceError` 429. Dùng trong service cho giới hạn theo danh tính (email...),
 * còn giới hạn theo IP dùng `createRateLimitMiddleware`.
 */
export async function assertRateLimit(rule: RateLimitRule, identity: string) {
    const count = await cacheService.incr(
        `rate-limit:${rule.name}:${identity.toLowerCase()}`,
        rule.windowSeconds
    );
    if (count > rule.limit) {
        serviceError(
            `Too many requests, try again in ${rule.windowSeconds}s`,
            429,
            ResponseCode.TOO_MANY_REQUESTS
        );
    }
}

/**
 * IP client — route REST của uWS transport không truyền địa chỉ socket xuống router, nên chỉ lấy
 * được qua header của reverse proxy (bật `TRUST_PROXY`). Không tin proxy → 1 bucket chung.
 */
export function getClientIp(getHeader: (name: string) => string | null | undefined): string {
    if (!env.TRUST_PROXY) return "direct";
    const forwarded = getHeader("x-forwarded-for")?.split(",")[0]?.trim();
    return getHeader("cf-connecting-ip") || getHeader("x-real-ip") || forwarded || "unknown";
}
