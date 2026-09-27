import { createEndpoint } from "colyseus";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";
import { adminMapService } from "@/modules/maps/admin/services/admin.map.service.js";
import {
    AdminCreateMapSchema,
    AdminListMapsQuerySchema,
    AdminUpdateMapSchema,
} from "@/modules/maps/admin/validators/admin.map.validator.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/admin/maps";

export const adminMapController = {
    adminMapIndex: adminEndpoint(
        prefix,
        { method: "GET", query: AdminListMapsQuerySchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await adminMapService.list(ctx.query);
                return Response.ok({ data: result });
            })
    ),

    adminMapShow: adminEndpoint(`${prefix}/:id`, { method: "GET", params: IdParamSchema }, (ctx) =>
        RouterContainer(ctx, async () => {
            const map = await adminMapService.findById({ id: ctx.params.id });
            if (!map) return Response.notFound(ctx);
            return Response.ok({ data: map });
        })
    ),

    adminMapCreate: adminEndpoint(prefix, { method: "POST", body: AdminCreateMapSchema }, (ctx) =>
        RouterContainer(ctx, async () => {
            const map = await adminMapService.createMap(ctx.body);
            return Response.created(ctx, { data: map });
        })
    ),

    adminMapUpdate: adminEndpoint(
        `${prefix}/:id`,
        { method: "PUT", params: IdParamSchema, body: AdminUpdateMapSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const map = await adminMapService.updateMap(ctx.params.id, ctx.body);
                if (!map) return Response.notFound(ctx);
                return Response.ok({ data: map });
            })
    ),
};
