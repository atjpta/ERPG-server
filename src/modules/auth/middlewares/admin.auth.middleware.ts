import { CommonCode } from "@/core/enums/common-code.enum.js";
import { AuthErrorCode } from "@/modules/auth/enums/auth-error-code.enum.js";
import { createMiddleware } from "colyseus";
import { HttpResponse } from "@/core/utils/response.util.js";
import { adminSessionService } from "@/modules/auth/services/admin-session.service.js";
import type { AuthAdmin } from "@/modules/auth/types/auth-user.type.js";

/** Xác thực token admin (ký bằng `ADMIN_JWT_SECRET`) — `ctx.context` = `AuthAdmin`. */
export const adminAuthMiddleware = createMiddleware(
    { requireHeaders: true },
    async (ctx): Promise<AuthAdmin> => {
        const authHeader = ctx.getHeader("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            HttpResponse.unauthorized(ctx, {
                message: "Missing token",
                code: CommonCode.MISSING_TOKEN,
            });
        }

        let tokenData: AuthAdmin;
        try {
            tokenData = adminSessionService.verifyToken(authHeader!.slice(7));
        } catch {
            HttpResponse.unauthorized(ctx, {
                message: "Invalid or expired token",
                code: CommonCode.INVALID_TOKEN,
            });
        }

        // Luôn đọc lại DB — admin bị vô hiệu hoá thì token cũ mất hiệu lực ngay.
        const admin = await adminSessionService.getActiveById(tokenData!.adminId);
        if (!admin) {
            HttpResponse.forbidden(ctx, {
                message: "Admin access required",
                code: AuthErrorCode.ADMIN_ACCESS_REQUIRED,
            });
        }

        return { ...tokenData!, role: admin!.role };
    }
);
