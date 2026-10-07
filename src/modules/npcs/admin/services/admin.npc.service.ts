import { ilike } from "drizzle-orm";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { BaseService } from "@/core/services/base.service.js";
import { serviceError } from "@/core/utils/service-error.js";
import type {
    AdminCreateNpcBody,
    AdminListNpcsQuery,
    AdminUpdateNpcBody,
} from "@/modules/npcs/admin/validators/admin.npc.validator.js";
import { Npcs } from "@/modules/npcs/entities/npc.entity.js";
import { NpcRepo } from "@/modules/npcs/repositories/npc.repository.js";
import { npcService } from "@/modules/npcs/services/npc.service.js";

export class AdminNpcService extends BaseService<typeof Npcs> {
    constructor() {
        super(NpcRepo);
    }

    async list(query: AdminListNpcsQuery) {
        const { search, ...pagination } = query;
        return this.paginate({
            pagination,
            where: search ? ilike(Npcs.code, `%${search}%`) : undefined,
        });
    }

    async createNpc(body: AdminCreateNpcBody) {
        if (await NpcRepo.findByCode({ code: body.code })) {
            serviceError("NPC code is existed", 409, ResponseCode.NPC_CODE_EXISTS);
        }
        const npc = await this.create({ data: body });
        await npcService.setCacheData();
        return npc;
    }

    async updateNpc(id: string, body: AdminUpdateNpcBody) {
        const npc = await this.updateById({ id, data: body });
        await npcService.setCacheData();
        return npc;
    }
}

export const adminNpcService = new AdminNpcService();
