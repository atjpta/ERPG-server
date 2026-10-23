import { CommonCode } from "@/core/enums/common-code.enum.js";
import { createMiddleware } from "colyseus";
import { HttpResponse } from "@/core/response/http-response.js";
import type { AuthUser } from "@/modules/auth/types/auth-user.type.js";
import { userSessionService } from "@/modules/auth/services/user-session.service.js";

/** Xác thực token tài khoản (user) — `ctx.context` = `AuthUser`. */
export const userAuthMiddleware = createMiddleware(
    { requireHeaders: true },
    async (ctx): Promise<AuthUser> => {
        const authHeader = ctx.getHeader("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            HttpResponse.unauthorized(ctx, CommonCode.MISSING_TOKEN);
        }

        try {
            return await userSessionService.verifyToken(authHeader!.slice(7));
        } catch {
            HttpResponse.unauthorized(ctx, CommonCode.INVALID_TOKEN);
        }
        throw new Error("unreachable");
    }
);
