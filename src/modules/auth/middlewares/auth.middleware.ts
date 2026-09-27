import { createMiddleware } from "colyseus";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { Response } from "@/core/utils/response.util.js";
import type { AuthUser } from "@/modules/auth/types/auth-user.type.js";
import { authService } from "@/modules/auth/user/services/auth.service.js";

/** Xác thực token tài khoản (user) — `ctx.context` = `AuthUser`. */
export const authMiddleware = createMiddleware(
    { requireHeaders: true },
    async (ctx): Promise<AuthUser> => {
        const authHeader = ctx.getHeader("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            Response.unauthorized(ctx, {
                message: "🔒 Missing token",
                code: ResponseCode.MISSING_TOKEN,
            });
        }

        try {
            return await authService.verifyToken(authHeader!.slice(7));
        } catch {
            Response.unauthorized(ctx, {
                message: "🔒 Invalid or expired token",
                code: ResponseCode.INVALID_TOKEN,
            });
        }
        throw new Error("unreachable");
    }
);
