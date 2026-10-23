import { createEndpoint } from "colyseus";
import { HttpResponse, RouterContainer } from "@/core/utils/response.util.js";
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
                return HttpResponse.ok({ data: result });
            })
    ),

    adminNpcShow: adminEndpoint(`${prefix}/:id`, { method: "GET", params: IdParamSchema }, (ctx) =>
        RouterContainer(ctx, async () => {
            const npc = await adminNpcService.findById({ id: ctx.params.id });
            if (!npc) return HttpResponse.notFound(ctx);
            return HttpResponse.ok({ data: npc });
        })
    ),

    adminNpcCreate: adminEndpoint(prefix, { method: "POST", body: AdminCreateNpcSchema }, (ctx) =>
        RouterContainer(ctx, async () => {
            const npc = await adminNpcService.createNpc(ctx.body);
            return HttpResponse.created(ctx, { data: npc });
        })
    ),

    adminNpcUpdate: adminEndpoint(
        `${prefix}/:id`,
        { method: "PUT", params: IdParamSchema, body: AdminUpdateNpcSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const npc = await adminNpcService.updateNpc(ctx.params.id, ctx.body);
                if (!npc) return HttpResponse.notFound(ctx);
                return HttpResponse.ok({ data: npc });
            })
    ),
};
