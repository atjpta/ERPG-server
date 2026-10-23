import { CommonCode } from "@/core/enums/common-code.enum.js";
import { createMiddleware } from "colyseus";
import { HttpResponse } from "@/core/response/http-response.js";
import type { AuthPlayer } from "@/core/types/auth-player.type.js";
import { playerAuthService } from "@/modules/auth/services/player-auth.service.js";

/** Xác thực player token — `ctx.context` = `AuthPlayer`. Dùng cho API gắn với player đang chơi. */
export const playerAuthMiddleware = createMiddleware(
    { requireHeaders: true },
    async (ctx): Promise<AuthPlayer> => {
        const authHeader = ctx.getHeader("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            HttpResponse.unauthorized(ctx, CommonCode.MISSING_TOKEN);
        }

        try {
            return await playerAuthService.verifyToken(authHeader!.slice(7));
        } catch {
            HttpResponse.unauthorized(ctx, CommonCode.INVALID_TOKEN);
        }
        throw new Error("unreachable");
    }
);
