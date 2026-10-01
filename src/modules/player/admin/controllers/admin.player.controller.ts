import { createEndpoint } from "colyseus";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { adminPlayerService } from "@/modules/player/admin/services/admin.player.service.js";
import {
    AdminBanPlayerSchema,
    AdminListPlayersQuerySchema,
    AdminUpdatePlayerSchema,
} from "@/modules/player/admin/validators/admin.player.validator.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/admin/players";

export const adminPlayerController = {
    adminPlayerIndex: adminEndpoint(
        prefix,
        { method: "GET", query: AdminListPlayersQuerySchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await adminPlayerService.list(ctx.query);
                return Response.ok({ data: result });
            })
    ),

    adminPlayerShow: adminEndpoint(
        `${prefix}/:id`,
        { method: "GET", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const player = await adminPlayerService.findPlayerById(ctx.params.id);
                return Response.ok({ data: player });
            })
    ),

    adminPlayerUpdate: adminEndpoint(
        `${prefix}/:id`,
        { method: "PUT", params: IdParamSchema, body: AdminUpdatePlayerSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const player = await adminPlayerService.updatePlayer(ctx.params.id, ctx.body);
                if (!player) return Response.notFound(ctx);
                return Response.ok({ data: player });
            })
    ),

    adminPlayerBan: adminEndpoint(
        `${prefix}/:id/ban`,
        { method: "POST", params: IdParamSchema, body: AdminBanPlayerSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const player = await adminPlayerService.ban(ctx.params.id, ctx.body);
                if (!player) return Response.notFound(ctx);
                return Response.ok({ data: player });
            })
    ),

    adminPlayerUnban: adminEndpoint(
        `${prefix}/:id/unban`,
        { method: "POST", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const player = await adminPlayerService.unban(ctx.params.id);
                if (!player) return Response.notFound(ctx);
                return Response.ok({ data: player });
            })
    ),
};
