import { createEndpoint } from "colyseus";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";
import { adminQuestService } from "@/modules/quests/admin/services/admin.quest.service.js";
import {
    AdminCreateQuestSchema,
    AdminListQuestsQuerySchema,
    AdminUpdateQuestSchema,
} from "@/modules/quests/admin/validators/admin.quest.validator.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/admin/quests";

export const adminQuestController = {
    adminQuestIndex: adminEndpoint(
        prefix,
        { method: "GET", query: AdminListQuestsQuerySchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await adminQuestService.list(ctx.query);
                return Response.ok({ data: result });
            })
    ),

    adminQuestShow: adminEndpoint(
        `${prefix}/:id`,
        { method: "GET", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const quest = await adminQuestService.findById({ id: ctx.params.id });
                if (!quest) return Response.notFound(ctx);
                return Response.ok({ data: quest });
            })
    ),

    adminQuestCreate: adminEndpoint(
        prefix,
        { method: "POST", body: AdminCreateQuestSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const quest = await adminQuestService.createQuest(ctx.body);
                return Response.created(ctx, { data: quest });
            })
    ),

    adminQuestUpdate: adminEndpoint(
        `${prefix}/:id`,
        { method: "PUT", params: IdParamSchema, body: AdminUpdateQuestSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const quest = await adminQuestService.updateQuest(ctx.params.id, ctx.body);
                if (!quest) return Response.notFound(ctx);
                return Response.ok({ data: quest });
            })
    ),
};
