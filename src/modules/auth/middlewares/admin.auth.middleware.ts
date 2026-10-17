import { createMiddleware } from "colyseus";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { Response } from "@/core/utils/response.util.js";
import { adminSessionService } from "@/modules/auth/services/admin-session.service.js";
import type { AuthAdmin } from "@/modules/auth/types/auth-user.type.js";

/** Xác thực token admin (ký bằng `ADMIN_JWT_SECRET`) — `ctx.context` = `AuthAdmin`. */
export const adminAuthMiddleware = createMiddleware(
    { requireHeaders: true },
    async (ctx): Promise<AuthAdmin> => {
        const authHeader = ctx.getHeader("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            Response.unauthorized(ctx, {
                message: "🔒 Missing token",
                code: ResponseCode.MISSING_TOKEN,
            });
        }

        let tokenData: AuthAdmin;
        try {
            tokenData = adminSessionService.verifyToken(authHeader!.slice(7));
        } catch {
            Response.unauthorized(ctx, {
                message: "🔒 Invalid or expired token",
                code: ResponseCode.INVALID_TOKEN,
            });
        }

        // Luôn đọc lại DB — admin bị vô hiệu hoá thì token cũ mất hiệu lực ngay.
        const admin = await adminSessionService.getActiveById(tokenData!.adminId);
        if (!admin) {
            Response.forbidden(ctx, {
                message: "🚫 Admin access required",
                code: ResponseCode.ADMIN_ACCESS_REQUIRED,
            });
        }

        return { ...tokenData!, role: admin!.role };
    }
);
