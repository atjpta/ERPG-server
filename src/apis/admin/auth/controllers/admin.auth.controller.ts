import { createEndpoint } from "colyseus";
import { createRateLimitMiddleware } from "@/core/middlewares/rate-limit.middleware.js";
import { HttpResponse, RouterContainer } from "@/core/response/http-response.js";
import { ADMIN_LOGIN_IP_RATE_LIMIT } from "@/modules/auth/constants/rate-limit.constant.js";
import { AdminLoginSchema } from "@/apis/admin/auth/validators/admin.auth.validator.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";
import { AdminRepo } from "@/modules/auth/repositories/admin.repository.js";
import { adminAuthService } from "@/modules/auth/services/admin-auth.service.js";

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
                return HttpResponse.from(ctx, result);
            })
    ),

    adminAuthMe: adminEndpoint(`${prefix}/me`, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const admin = await AdminRepo.findById({ id: ctx.context.adminId });
            if (!admin) return HttpResponse.notFound(ctx);
            const { password: _password, ...profile } = admin;
            return HttpResponse.success(profile);
        })
    ),
};
