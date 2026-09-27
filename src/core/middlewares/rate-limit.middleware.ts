import { createMiddleware } from "colyseus";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { Response } from "@/core/utils/response.util.js";
import { assertRateLimit, getClientIp, type RateLimitRule } from "@/core/utils/rate-limit.util.js";

/** Giới hạn số request theo IP cho 1 nhóm endpoint — gắn vào `use: [...]` của endpoint. Đưa IP vào `ctx.context.clientIp`. */
export const createRateLimitMiddleware = (rule: RateLimitRule) =>
    createMiddleware({ requireHeaders: true }, async (ctx) => {
        const clientIp = getClientIp((name) => ctx.getHeader(name));
        try {
            await assertRateLimit(rule, clientIp);
        } catch {
            Response.tooManyRequests(ctx, {
                code: ResponseCode.TOO_MANY_REQUESTS,
                retryAfterSeconds: rule.windowSeconds,
            });
        }
        return { clientIp };
    });
