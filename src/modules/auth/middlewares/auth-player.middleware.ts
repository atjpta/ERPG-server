import { createMiddleware } from "colyseus";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { Response } from "@/core/utils/response.util.js";
import type { AuthPlayer } from "@/modules/auth/types/auth-user.type.js";
import { playerService } from "@/modules/auth/user/services/player.service.js";

/** Xác thực player token — `ctx.context` = `AuthPlayer`. Dùng cho API gắn với player đang chơi. */
export const authPlayerMiddleware = createMiddleware(
    { requireHeaders: true },
    async (ctx): Promise<AuthPlayer> => {
        const authHeader = ctx.getHeader("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            Response.unauthorized(ctx, {
                message: "🔒 Missing token",
                code: ResponseCode.MISSING_TOKEN,
            });
        }

        try {
            return await playerService.verifyToken(authHeader!.slice(7));
        } catch {
            Response.unauthorized(ctx, {
                message: "🔒 Invalid or expired token",
                code: ResponseCode.INVALID_TOKEN,
            });
        }
        throw new Error("unreachable");
    }
);
