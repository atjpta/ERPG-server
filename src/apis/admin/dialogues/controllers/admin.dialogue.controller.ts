import { createEndpoint } from "colyseus";
import { HttpResponse, RouterContainer } from "@/core/utils/response.util.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";
import { adminDialogueService } from "@/apis/admin/dialogues/services/admin.dialogue.service.js";
import {
    AdminCreateDialogueSchema,
    AdminListDialoguesQuerySchema,
    AdminUpdateDialogueSchema,
} from "@/apis/admin/dialogues/validators/admin.dialogue.validator.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/dialogues";

export const adminDialogueController = {
    adminDialogueIndex: adminEndpoint(
        prefix,
        { method: "GET", query: AdminListDialoguesQuerySchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await adminDialogueService.list(ctx.query);
                return HttpResponse.ok({ data: result });
            })
    ),

    adminDialogueShow: adminEndpoint(
        `${prefix}/:id`,
        { method: "GET", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const dialogue = await adminDialogueService.findById({ id: ctx.params.id });
                if (!dialogue) return HttpResponse.notFound(ctx);
                return HttpResponse.ok({ data: dialogue });
            })
    ),

    adminDialogueCreate: adminEndpoint(
        prefix,
        { method: "POST", body: AdminCreateDialogueSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const dialogue = await adminDialogueService.createDialogue(ctx.body);
                return HttpResponse.created(ctx, { data: dialogue });
            })
    ),

    adminDialogueUpdate: adminEndpoint(
        `${prefix}/:id`,
        { method: "PUT", params: IdParamSchema, body: AdminUpdateDialogueSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const dialogue = await adminDialogueService.updateDialogue(ctx.params.id, ctx.body);
                if (!dialogue) return HttpResponse.notFound(ctx);
                return HttpResponse.ok({ data: dialogue });
            })
    ),
};
