import { createEndpoint } from "colyseus";
import { HttpResponse, RouterContainer } from "@/core/response/http-response.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";
import { ilike } from "drizzle-orm";
import { DialogueRepo } from "@/modules/dialogues/repositories/dialogue.repository.js";
import { Dialogues } from "@/modules/dialogues/entities/dialogue.entity.js";
import { DialogueErrorCode } from "@/modules/dialogues/enums/dialogue-error-code.enum.js";
import { dialogueService } from "@/modules/dialogues/services/dialogue.service.js";
import { dialogueGraphService } from "@/modules/dialogues/services/dialogue-graph.service.js";
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
                const { search, ...pagination } = ctx.query;
                const result = await DialogueRepo.paginate({
                    pagination,
                    where: search ? ilike(Dialogues.code, `%${search}%`) : undefined,
                });
                return HttpResponse.success(result);
            })
    ),

    adminDialogueShow: adminEndpoint(
        `${prefix}/:id`,
        { method: "GET", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const dialogue = await DialogueRepo.findById({ id: ctx.params.id });
                if (!dialogue) return HttpResponse.notFound(ctx);
                return HttpResponse.success(dialogue);
            })
    ),

    adminDialogueCreate: adminEndpoint(
        prefix,
        { method: "POST", body: AdminCreateDialogueSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                if (await DialogueRepo.findByCode({ code: ctx.body.code })) {
                    return HttpResponse.conflict(ctx, DialogueErrorCode.DIALOGUE_CODE_EXISTS);
                }
                const graphErrors = dialogueGraphService.validateDialogueGraph(ctx.body.nodes);
                if (graphErrors.length > 0) {
                    return HttpResponse.unprocessable(ctx, DialogueErrorCode.DIALOGUE_INVALID, {
                        errors: graphErrors,
                    });
                }
                const dialogue = await DialogueRepo.create({ data: ctx.body });
                await dialogueService.setCacheData();
                return HttpResponse.created(ctx, dialogue);
            })
    ),

    adminDialogueUpdate: adminEndpoint(
        `${prefix}/:id`,
        { method: "PUT", params: IdParamSchema, body: AdminUpdateDialogueSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                if (ctx.body.nodes) {
                    const graphErrors = dialogueGraphService.validateDialogueGraph(ctx.body.nodes);
                    if (graphErrors.length > 0) {
                        return HttpResponse.unprocessable(ctx, DialogueErrorCode.DIALOGUE_INVALID, {
                            errors: graphErrors,
                        });
                    }
                }
                const dialogue = await DialogueRepo.updateById({
                    id: ctx.params.id,
                    data: ctx.body,
                });
                if (dialogue) await dialogueService.setCacheData();
                if (!dialogue) return HttpResponse.notFound(ctx);
                return HttpResponse.success(dialogue);
            })
    ),
};
