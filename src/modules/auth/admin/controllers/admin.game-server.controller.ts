import { createEndpoint } from "colyseus";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";
import { adminGameServerService } from "@/modules/auth/admin/services/admin.game-server.service.js";
import {
    AdminCreateGameServerSchema,
    AdminListGameServersQuerySchema,
    AdminUpdateGameServerSchema,
} from "@/modules/auth/admin/validators/admin.game-server.validator.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/admin/game-servers";

export const adminGameServerController = {
    adminGameServerIndex: adminEndpoint(
        prefix,
        { method: "GET", query: AdminListGameServersQuerySchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await adminGameServerService.list(ctx.query);
                return Response.ok({ data: result });
            })
    ),

    adminGameServerShow: adminEndpoint(
        `${prefix}/:id`,
        { method: "GET", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const server = await adminGameServerService.findById({ id: ctx.params.id });
                if (!server) return Response.notFound(ctx);
                return Response.ok({ data: server });
            })
    ),

    adminGameServerCreate: adminEndpoint(
        prefix,
        { method: "POST", body: AdminCreateGameServerSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const server = await adminGameServerService.createServer(ctx.body);
                return Response.created(ctx, { data: server });
            })
    ),

    adminGameServerUpdate: adminEndpoint(
        `${prefix}/:id`,
        { method: "PUT", params: IdParamSchema, body: AdminUpdateGameServerSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const server = await adminGameServerService.updateServer(ctx.params.id, ctx.body);
                if (!server) return Response.notFound(ctx);
                return Response.ok({ data: server });
            })
    ),
};
