import { createEndpoint } from "colyseus";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";
import { adminDialogueService } from "@/modules/dialogues/admin/services/admin.dialogue.service.js";
import {
    AdminCreateDialogueSchema,
    AdminListDialoguesQuerySchema,
    AdminUpdateDialogueSchema,
} from "@/modules/dialogues/admin/validators/admin.dialogue.validator.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/admin/dialogues";

export const adminDialogueController = {
    adminDialogueIndex: adminEndpoint(
        prefix,
        { method: "GET", query: AdminListDialoguesQuerySchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await adminDialogueService.list(ctx.query);
                return Response.ok({ data: result });
            })
    ),

    adminDialogueShow: adminEndpoint(
        `${prefix}/:id`,
        { method: "GET", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const dialogue = await adminDialogueService.findById({ id: ctx.params.id });
                if (!dialogue) return Response.notFound(ctx);
                return Response.ok({ data: dialogue });
            })
    ),

    adminDialogueCreate: adminEndpoint(
        prefix,
        { method: "POST", body: AdminCreateDialogueSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const dialogue = await adminDialogueService.createDialogue(ctx.body);
                return Response.created(ctx, { data: dialogue });
            })
    ),

    adminDialogueUpdate: adminEndpoint(
        `${prefix}/:id`,
        { method: "PUT", params: IdParamSchema, body: AdminUpdateDialogueSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const dialogue = await adminDialogueService.updateDialogue(ctx.params.id, ctx.body);
                if (!dialogue) return Response.notFound(ctx);
                return Response.ok({ data: dialogue });
            })
    ),
};
