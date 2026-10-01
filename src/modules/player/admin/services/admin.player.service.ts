import { and, eq, ilike } from "drizzle-orm";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import { BaseService } from "@/core/services/base.service.js";
import { serviceError } from "@/core/utils/service-error.js";
import { Players } from "@/modules/auth/entities/player.entity.js";
import { KickReason } from "@/modules/auth/enums/kick-reason.enum.js";
import { PlayerStatus } from "@/modules/auth/enums/player-status.enum.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { playerKickService } from "@/modules/auth/user/services/player-kick.service.js";
import type {
    AdminBanPlayerBody,
    AdminListPlayersQuery,
    AdminUpdatePlayerBody,
} from "@/modules/player/admin/validators/admin.player.validator.js";
import { PlayerStateRepo } from "@/modules/player/repositories/player-state.repository.js";
import { playerService } from "@/modules/player/user/services/player.service.js";
import { mapService } from "@/modules/maps/user/services/map.service.js";

export class AdminPlayerService extends BaseService<typeof Players> {
    constructor() {
        super(PlayerIdentityRepo);
    }

    async list(query: AdminListPlayersQuery) {
        const { search, serverId, userId, status, page, limit } = query;
        const where = and(
            search ? ilike(Players.name, `%${search}%`) : undefined,
            serverId ? eq(Players.serverId, serverId) : undefined,
            userId ? eq(Players.userId, userId) : undefined,
            status ? eq(Players.status, status) : undefined
        );
        const result = await this.paginate({ pagination: { page, limit }, where });
        const states = await PlayerStateRepo.findByPlayerIds(result.items.map((p) => p.id));
        const stateByPlayerId = new Map(states.map((state) => [state.playerId, state]));
        return {
            ...result,
            items: result.items.map((player) => {
                const state = stateByPlayerId.get(player.id);
                return state
                    ? {
                          ...player,
                          level: state.level,
                          exp: state.exp,
                          mapCode: state.mapCode,
                          x: state.x,
                          y: state.y,
                          direction: state.direction,
                          hp: state.hp,
                          mp: state.mp,
                      }
                    : player;
            }),
        };
    }

    async findPlayerById(id: string) {
        const player = await PlayerIdentityRepo.findById({ id });
        return player ? playerService.findWithStateById(id) : null;
    }

    async updatePlayer(id: string, body: AdminUpdatePlayerBody) {
        if (body.mapCode) await mapService.getActiveByCodeOrFail(body.mapCode);
        if (body.name) {
            const player = await PlayerIdentityRepo.findByIdOrFail({ id });
            const duplicated = await PlayerIdentityRepo.findByServerAndName({
                serverId: player.serverId,
                name: body.name,
                excludeId: id,
            });
            if (duplicated) {
                serviceError("Player name is existed", 409, ResponseCode.PLAYER_NAME_EXISTS);
            }
        }

        const { level, exp, hp, mp, mapCode, x, y, direction, ...authData } = body;
        const stateData = { level, exp, hp, mp, mapCode, x, y, direction };
        await withTransaction(async (tx) => {
            if (Object.keys(authData).length > 0) {
                await PlayerIdentityRepo.updateById({ id, data: authData, dbOrTx: tx });
            }
            if (Object.values(stateData).some((value) => value !== undefined)) {
                await PlayerStateRepo.updateByPlayerId(id, stateData, tx);
            }
        });
        const updatedPlayer = await playerService.findWithStateById(id);
        if (Object.keys(body).length > 0) {
            playerKickService.kickPlayer(
                updatedPlayer.userId,
                updatedPlayer.id,
                KickReason.PLAYER_UPDATED
            );
        }
        return updatedPlayer;
    }

    async ban(id: string, body: AdminBanPlayerBody) {
        const player = await PlayerIdentityRepo.updateById({
            id,
            data: { status: PlayerStatus.BANNED, banReason: body.reason ?? null },
        });
        if (!player) return null;
        playerKickService.kickPlayer(player.userId, player.id, KickReason.BANNED);
        return playerService.findWithStateById(id);
    }

    async unban(id: string) {
        const player = await PlayerIdentityRepo.updateById({
            id,
            data: { status: PlayerStatus.ACTIVE, banReason: null },
        });
        return player ? playerService.findWithStateById(id) : null;
    }
}

export const adminPlayerService = new AdminPlayerService();
