import { createEndpoint } from "colyseus";
import { HttpResponse, RouterContainer } from "@/core/response/http-response.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";
import { ilike } from "drizzle-orm";
import { NpcRepo } from "@/modules/npcs/repositories/npc.repository.js";
import { Npcs } from "@/modules/npcs/entities/npc.entity.js";
import { NpcErrorCode } from "@/modules/npcs/enums/npc-error-code.enum.js";
import { npcService } from "@/modules/npcs/services/npc.service.js";
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
                const { search, ...pagination } = ctx.query;
                const result = await NpcRepo.paginate({
                    pagination,
                    where: search ? ilike(Npcs.code, `%${search}%`) : undefined,
                });
                return HttpResponse.success(result);
            })
    ),

    adminNpcShow: adminEndpoint(`${prefix}/:id`, { method: "GET", params: IdParamSchema }, (ctx) =>
        RouterContainer(ctx, async () => {
            const npc = await NpcRepo.findById({ id: ctx.params.id });
            if (!npc) return HttpResponse.notFound(ctx);
            return HttpResponse.success(npc);
        })
    ),

    adminNpcCreate: adminEndpoint(prefix, { method: "POST", body: AdminCreateNpcSchema }, (ctx) =>
        RouterContainer(ctx, async () => {
            if (await NpcRepo.findByCode({ code: ctx.body.code })) {
                return HttpResponse.conflict(ctx, NpcErrorCode.NPC_CODE_EXISTS);
            }
            const npc = await NpcRepo.create({ data: ctx.body });
            await npcService.setCacheData();
            return HttpResponse.created(ctx, npc);
        })
    ),

    adminNpcUpdate: adminEndpoint(
        `${prefix}/:id`,
        { method: "PUT", params: IdParamSchema, body: AdminUpdateNpcSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const npc = await NpcRepo.updateById({ id: ctx.params.id, data: ctx.body });
                if (npc) await npcService.setCacheData();
                if (!npc) return HttpResponse.notFound(ctx);
                return HttpResponse.success(npc);
            })
    ),
};
