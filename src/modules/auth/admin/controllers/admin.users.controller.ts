import { createEndpoint } from "colyseus";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { adminUsersService } from "@/modules/auth/admin/services/admin.users.service.js";
import {
    AdminBanUserSchema,
    AdminListUsersQuerySchema,
    AdminUserSessionParamSchema,
} from "@/modules/auth/admin/validators/admin.users.validator.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/admin/users";

export const adminUsersController = {
    adminUsersIndex: adminEndpoint(
        prefix,
        { method: "GET", query: AdminListUsersQuerySchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await adminUsersService.list(ctx.query);
                return Response.ok({ data: result });
            })
    ),

    adminUsersShow: adminEndpoint(
        `${prefix}/:id`,
        { method: "GET", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const user = await adminUsersService.getDetail(ctx.params.id);
                if (!user) return Response.notFound(ctx);
                return Response.ok({ data: user });
            })
    ),

    adminUsersBan: adminEndpoint(
        `${prefix}/:id/ban`,
        { method: "POST", params: IdParamSchema, body: AdminBanUserSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const user = await adminUsersService.ban(ctx.params.id, ctx.body);
                if (!user) return Response.notFound(ctx);
                return Response.ok({ data: user });
            })
    ),

    adminUsersUnban: adminEndpoint(
        `${prefix}/:id/unban`,
        { method: "POST", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const user = await adminUsersService.unban(ctx.params.id);
                if (!user) return Response.notFound(ctx);
                return Response.ok({ data: user });
            })
    ),

    /** Ép user đăng xuất khỏi mọi thiết bị. */
    adminUsersForceLogout: adminEndpoint(
        `${prefix}/:id/force-logout`,
        { method: "POST", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const user = await adminUsersService.forceLogout(ctx.params.id);
                if (!user) return Response.notFound(ctx);
                return Response.ok({ message: "🔒 User logged out from all devices" });
            })
    ),

    adminUsersSessions: adminEndpoint(
        `${prefix}/:id/sessions`,
        { method: "GET", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const sessions = await adminUsersService.listSessions(ctx.params.id);
                return Response.ok({ data: sessions });
            })
    ),

    adminUsersRevokeSession: adminEndpoint(
        `${prefix}/:id/sessions/:sessionId/revoke`,
        { method: "POST", params: AdminUserSessionParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const { id, sessionId } = ctx.params;
                const session = await adminUsersService.revokeSession(id, sessionId);
                if (!session) return Response.notFound(ctx);
                return Response.ok({ message: "🔒 Session revoked" });
            })
    ),
};
