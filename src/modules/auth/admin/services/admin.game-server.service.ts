import { and, eq, ilike, or } from "drizzle-orm";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { BaseService } from "@/core/services/base.service.js";
import { serviceError } from "@/core/utils/service-error.js";
import type {
    AdminCreateGameServerBody,
    AdminListGameServersQuery,
    AdminUpdateGameServerBody,
} from "@/modules/auth/admin/validators/admin.game-server.validator.js";
import { GameServers } from "@/modules/auth/entities/game-server.entity.js";
import { GameServerRepo } from "@/modules/auth/repositories/game-server.repository.js";

export class AdminGameServerService extends BaseService<typeof GameServers> {
    constructor() {
        super(GameServerRepo);
    }

    async list(query: AdminListGameServersQuery) {
        const { search, status, ...pagination } = query;
        const where = and(
            search
                ? or(ilike(GameServers.code, `%${search}%`), ilike(GameServers.name, `%${search}%`))
                : undefined,
            status ? eq(GameServers.status, status) : undefined
        );
        return this.paginate({ pagination, where });
    }

    async createServer(body: AdminCreateGameServerBody) {
        if (await GameServerRepo.findByCode({ code: body.code })) {
            serviceError("Game server code is existed", 409, ResponseCode.GAME_SERVER_CODE_EXISTS);
        }
        return this.create({ data: body });
    }

    async updateServer(id: string, body: AdminUpdateGameServerBody) {
        return this.updateById({ id, data: body });
    }
}

export const adminGameServerService = new AdminGameServerService();
