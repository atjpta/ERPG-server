import { createEndpoint } from "colyseus";
import { createRateLimitMiddleware } from "@/core/middlewares/rate-limit.middleware.js";
import { HttpResponse, RouterContainer } from "@/core/utils/response.util.js";
import { ADMIN_LOGIN_IP_RATE_LIMIT } from "@/modules/auth/constants/rate-limit.constant.js";
import { adminAuthService } from "@/apis/admin/auth/services/admin.auth.service.js";
import { AdminLoginSchema } from "@/apis/admin/auth/validators/admin.auth.validator.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/auth";

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
                return HttpResponse.ok({ data: result });
            })
    ),

    adminAuthMe: adminEndpoint(`${prefix}/me`, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const profile = await adminAuthService.getProfile(ctx.context.adminId);
            if (!profile) return HttpResponse.notFound(ctx);
            return HttpResponse.ok({ data: profile });
        })
    ),
};
