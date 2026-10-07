import { ilike } from "drizzle-orm";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { BaseService } from "@/core/services/base.service.js";
import { serviceError } from "@/core/utils/service-error.js";
import type {
    AdminCreateQuestBody,
    AdminListQuestsQuery,
    AdminUpdateQuestBody,
} from "@/modules/quests/admin/validators/admin.quest.validator.js";
import { Quests } from "@/modules/quests/entities/quest.entity.js";
import { QuestRepo } from "@/modules/quests/repositories/quest.repository.js";
import { questService } from "@/modules/quests/services/quest.service.js";

export class AdminQuestService extends BaseService<typeof Quests> {
    constructor() {
        super(QuestRepo);
    }

    async list(query: AdminListQuestsQuery) {
        const { search, ...pagination } = query;
        return this.paginate({
            pagination,
            where: search ? ilike(Quests.code, `%${search}%`) : undefined,
        });
    }

    async createQuest(body: AdminCreateQuestBody) {
        if (await QuestRepo.findByCode({ code: body.code })) {
            serviceError("Quest code is existed", 409, ResponseCode.QUEST_CODE_EXISTS);
        }
        const quest = await this.create({ data: body });
        await questService.setCacheData();
        return quest;
    }

    async updateQuest(id: string, body: AdminUpdateQuestBody) {
        const quest = await this.updateById({ id, data: body });
        await questService.setCacheData();
        return quest;
    }
}

export const adminQuestService = new AdminQuestService();
