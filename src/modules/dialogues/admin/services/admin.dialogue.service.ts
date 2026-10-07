import { ilike } from "drizzle-orm";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { BaseService } from "@/core/services/base.service.js";
import { serviceError } from "@/core/utils/service-error.js";
import type {
    AdminCreateDialogueBody,
    AdminListDialoguesQuery,
    AdminUpdateDialogueBody,
} from "@/modules/dialogues/admin/validators/admin.dialogue.validator.js";
import { Dialogues } from "@/modules/dialogues/entities/dialogue.entity.js";
import { DialogueRepo } from "@/modules/dialogues/repositories/dialogue.repository.js";
import type { DialogueNode } from "@/modules/dialogues/schemas/dialogue.schema.js";
import { dialogueService } from "@/modules/dialogues/services/dialogue.service.js";
import { validateDialogueGraph } from "@/modules/dialogues/utils/dialogue-graph.util.js";

const assertGraph = (nodes: readonly DialogueNode[]) => {
    const errors = validateDialogueGraph(nodes);
    if (errors.length > 0) serviceError(errors.join("; "), 422, ResponseCode.DIALOGUE_INVALID);
};

export class AdminDialogueService extends BaseService<typeof Dialogues> {
    constructor() {
        super(DialogueRepo);
    }

    async list(query: AdminListDialoguesQuery) {
        const { search, ...pagination } = query;
        return this.paginate({
            pagination,
            where: search ? ilike(Dialogues.code, `%${search}%`) : undefined,
        });
    }

    async createDialogue(body: AdminCreateDialogueBody) {
        if (await DialogueRepo.findByCode({ code: body.code })) {
            serviceError("Dialogue code is existed", 409, ResponseCode.DIALOGUE_CODE_EXISTS);
        }
        assertGraph(body.nodes);
        const dialogue = await this.create({ data: body });
        await dialogueService.setCacheData();
        return dialogue;
    }

    async updateDialogue(id: string, body: AdminUpdateDialogueBody) {
        if (body.nodes) assertGraph(body.nodes);
        const dialogue = await this.updateById({ id, data: body });
        await dialogueService.setCacheData();
        return dialogue;
    }
}

export const adminDialogueService = new AdminDialogueService();
