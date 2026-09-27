import { and, eq, ilike } from "drizzle-orm";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { BaseService } from "@/core/services/base.service.js";
import { serviceError } from "@/core/utils/service-error.js";
import type {
    AdminBanPlayerBody,
    AdminListPlayersQuery,
    AdminUpdatePlayerBody,
} from "@/modules/auth/admin/validators/admin.player.validator.js";
import { Players } from "@/modules/auth/entities/player.entity.js";
import { PlayerStatus } from "@/modules/auth/enums/player.enum.js";
import { PlayerRepo } from "@/modules/auth/repositories/player.repository.js";
import { mapService } from "@/modules/maps/user/services/map.service.js";
import { playerKickService } from "@/modules/auth/user/services/player-kick.service.js";
import { KickReason } from "@/modules/auth/enums/kick-reason.enum.js";

export class AdminPlayerService extends BaseService<typeof Players> {
    constructor() {
        super(PlayerRepo);
    }

    async list(query: AdminListPlayersQuery) {
        const { search, serverId, userId, status, page, limit } = query;
        const where = and(
            search ? ilike(Players.name, `%${search}%`) : undefined,
            serverId ? eq(Players.serverId, serverId) : undefined,
            userId ? eq(Players.userId, userId) : undefined,
            status ? eq(Players.status, status) : undefined
        );
        return this.paginate({ pagination: { page, limit }, where });
    }

    async updatePlayer(id: string, body: AdminUpdatePlayerBody) {
        if (body.mapCode) {
            await mapService.getActiveByCodeOrFail(body.mapCode);
        }
        if (body.name) {
            const player = await PlayerRepo.findByIdOrFail({ id });
            const duplicated = await PlayerRepo.findByServerAndName({
                serverId: player.serverId,
                name: body.name,
                excludeId: id,
            });
            if (duplicated) {
                serviceError("Player name is existed", 409, ResponseCode.PLAYER_NAME_EXISTS);
            }
        }
        return this.updateById({ id, data: body });
    }

    /** Ban player + đá khỏi room ngay nếu đang online. */
    async ban(id: string, body: AdminBanPlayerBody) {
        const player = await this.updateById({
            id,
            data: { status: PlayerStatus.BANNED, banReason: body.reason ?? null },
        });
        if (player) playerKickService.kickPlayer(player.userId, player.id, KickReason.BANNED);
        return player;
    }

    async unban(id: string) {
        return this.updateById({
            id,
            data: { status: PlayerStatus.ACTIVE, banReason: null },
        });
    }
}

export const adminPlayerService = new AdminPlayerService();
