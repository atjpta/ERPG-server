import { createEndpoint } from "colyseus";
import { createRateLimitMiddleware } from "@/core/middlewares/rate-limit.middleware.js";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { ADMIN_LOGIN_IP_RATE_LIMIT } from "@/modules/auth/constants/rate-limit.constant.js";
import { adminAuthService } from "@/modules/auth/admin/services/admin.auth.service.js";
import { AdminLoginSchema } from "@/modules/auth/admin/validators/admin.auth.validator.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/admin/auth";

export const adminAuthController = {
    adminAuthLogin: createEndpoint(
        `${prefix}/login`,
        {
            method: "POST",
            body: AdminLoginSchema,
            use: [createRateLimitMiddleware(ADMIN_LOGIN_IP_RATE_LIMIT)],
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await adminAuthService.login(ctx.body);
                return Response.ok({ data: result });
            })
    ),

    adminAuthMe: adminEndpoint(`${prefix}/me`, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const profile = await adminAuthService.getProfile(ctx.context.adminId);
            if (!profile) return Response.notFound(ctx);
            return Response.ok({ data: profile });
        })
    ),
};
