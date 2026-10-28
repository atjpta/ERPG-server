import { createEndpoint } from "colyseus";
import { and, eq, ilike } from "drizzle-orm";
import { HttpResponse, RouterContainer } from "@/core/response/http-response.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import {
    AdminBanUserSchema,
    AdminListUsersQuerySchema,
    AdminUserSessionParamSchema,
} from "@/apis/admin/auth/validators/admin.users.validator.js";
import { Users } from "@/modules/auth/entities/user.entity.js";
import { UserStatus } from "@/modules/auth/enums/user.enum.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";
import { UserSessionRepo } from "@/modules/auth/repositories/user-session.repository.js";
import { UserRepo } from "@/modules/auth/repositories/user.repository.js";
import { userModerationService } from "@/modules/auth/services/user-moderation.service.js";
import { omitPassword } from "@/modules/auth/utils/omit-password.util.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/users";

export const adminUsersController = {
    adminUsersIndex: adminEndpoint(
        prefix,
        { method: "GET", query: AdminListUsersQuerySchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const { search, status, ...pagination } = ctx.query;
                const where = and(
                    search ? ilike(Users.email, `%${search}%`) : undefined,
                    status ? eq(Users.status, status) : undefined
                );
                const result = await UserRepo.paginate({ pagination, where });
                return HttpResponse.success({ ...result, items: result.items.map(omitPassword) });
            })
    ),

    adminUsersShow: adminEndpoint(
        `${prefix}/:id`,
        { method: "GET", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const user = omitPassword(await UserRepo.findById({ id: ctx.params.id }));
                if (!user) return HttpResponse.notFound(ctx);
                return HttpResponse.success(user);
            })
    ),

    /** Ban user (chặn login) + đăng xuất khỏi mọi thiết bị ngay lập tức. */
    adminUsersBan: adminEndpoint(
        `${prefix}/:id/ban`,
        { method: "POST", params: IdParamSchema, body: AdminBanUserSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await userModerationService.ban({
                    userId: ctx.params.id,
                    ...ctx.body,
                });
                return HttpResponse.from(ctx, result);
            })
    ),

    adminUsersUnban: adminEndpoint(
        `${prefix}/:id/unban`,
        { method: "POST", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const user = await UserRepo.updateById({
                    id: ctx.params.id,
                    data: { status: UserStatus.ACTIVE, banReason: null, banExpiresAt: null },
                });
                if (!user) return HttpResponse.notFound(ctx);
                return HttpResponse.success(omitPassword(user));
            })
    ),

    /** Ép user đăng xuất khỏi mọi thiết bị. */
    adminUsersForceLogout: adminEndpoint(
        `${prefix}/:id/force-logout`,
        { method: "POST", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                return HttpResponse.from(
                    ctx,
                    await userModerationService.forceLogout(ctx.params.id)
                );
            })
    ),

    adminUsersSessions: adminEndpoint(
        `${prefix}/:id/sessions`,
        { method: "GET", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const sessions = await UserSessionRepo.findActiveByUserId({
                    userId: ctx.params.id,
                });
                return HttpResponse.success(sessions);
            })
    ),

    adminUsersRevokeSession: adminEndpoint(
        `${prefix}/:id/sessions/:sessionId/revoke`,
        { method: "POST", params: AdminUserSessionParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const { id, sessionId } = ctx.params;
                return HttpResponse.from(
                    ctx,
                    await userModerationService.revokeSession({ userId: id, sessionId })
                );
            })
    ),
};
