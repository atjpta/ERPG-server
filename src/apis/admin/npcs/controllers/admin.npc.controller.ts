import { createEndpoint } from "colyseus";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";
import { adminNpcService } from "@/apis/admin/npcs/services/admin.npc.service.js";
import {
    AdminCreateNpcSchema,
    AdminListNpcsQuerySchema,
    AdminUpdateNpcSchema,
} from "@/apis/admin/npcs/validators/admin.npc.validator.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/npcs";

export const adminNpcController = {
    adminNpcIndex: adminEndpoint(
        prefix,
        { method: "GET", query: AdminListNpcsQuerySchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await adminNpcService.list(ctx.query);
                return Response.ok({ data: result });
            })
    ),

    adminNpcShow: adminEndpoint(`${prefix}/:id`, { method: "GET", params: IdParamSchema }, (ctx) =>
        RouterContainer(ctx, async () => {
            const npc = await adminNpcService.findById({ id: ctx.params.id });
            if (!npc) return Response.notFound(ctx);
            return Response.ok({ data: npc });
        })
    ),

    adminNpcCreate: adminEndpoint(prefix, { method: "POST", body: AdminCreateNpcSchema }, (ctx) =>
        RouterContainer(ctx, async () => {
            const npc = await adminNpcService.createNpc(ctx.body);
            return Response.created(ctx, { data: npc });
        })
    ),

    adminNpcUpdate: adminEndpoint(
        `${prefix}/:id`,
        { method: "PUT", params: IdParamSchema, body: AdminUpdateNpcSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const npc = await adminNpcService.updateNpc(ctx.params.id, ctx.body);
                if (!npc) return Response.notFound(ctx);
                return Response.ok({ data: npc });
            })
    ),
};
