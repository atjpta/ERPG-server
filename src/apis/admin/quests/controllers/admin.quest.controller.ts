import { createEndpoint } from "colyseus";
import { HttpResponse, RouterContainer } from "@/core/response/http-response.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";
import { ilike } from "drizzle-orm";
import { QuestRepo } from "@/modules/quests/repositories/quest.repository.js";
import { Quests } from "@/modules/quests/entities/quest.entity.js";
import { QuestErrorCode } from "@/modules/quests/enums/quest-error-code.enum.js";
import { questService } from "@/modules/quests/services/quest.service.js";
import {
    AdminCreateQuestSchema,
    AdminListQuestsQuerySchema,
    AdminUpdateQuestSchema,
} from "@/apis/admin/quests/validators/admin.quest.validator.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/quests";

export const adminQuestController = {
    adminQuestIndex: adminEndpoint(
        prefix,
        { method: "GET", query: AdminListQuestsQuerySchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const { search, ...pagination } = ctx.query;
                const result = await QuestRepo.paginate({
                    pagination,
                    where: search ? ilike(Quests.code, `%${search}%`) : undefined,
                });
                return HttpResponse.success(result);
            })
    ),

    adminQuestShow: adminEndpoint(
        `${prefix}/:id`,
        { method: "GET", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const quest = await QuestRepo.findById({ id: ctx.params.id });
                if (!quest) return HttpResponse.notFound(ctx);
                return HttpResponse.success(quest);
            })
    ),

    adminQuestCreate: adminEndpoint(
        prefix,
        { method: "POST", body: AdminCreateQuestSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                if (await QuestRepo.findByCode({ code: ctx.body.code })) {
                    return HttpResponse.conflict(ctx, QuestErrorCode.QUEST_CODE_EXISTS);
                }
                const quest = await QuestRepo.create({ data: ctx.body });
                await questService.setCacheData();
                return HttpResponse.created(ctx, quest);
            })
    ),

    adminQuestUpdate: adminEndpoint(
        `${prefix}/:id`,
        { method: "PUT", params: IdParamSchema, body: AdminUpdateQuestSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const quest = await QuestRepo.updateById({ id: ctx.params.id, data: ctx.body });
                if (quest) await questService.setCacheData();
                if (!quest) return HttpResponse.notFound(ctx);
                return HttpResponse.success(quest);
            })
    ),
};
