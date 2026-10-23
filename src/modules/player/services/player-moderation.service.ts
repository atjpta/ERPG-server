import { CommonCode } from "@/core/enums/common-code.enum.js";
import { Response } from "@/core/response/response.js";
import { KickReason } from "@/core/enums/kick-reason.enum.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import { playerKickService } from "@/core/services/player-kick.service.js";
import { PlayerStatus } from "@/modules/auth/enums/player-status.enum.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { mapService } from "@/modules/maps/services/map.service.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { PlayerStateRepo } from "@/modules/player/repositories/player-state.repository.js";
import { playerService } from "@/modules/player/services/player.service.js";
import type { PlayerWithState } from "@/modules/player/types/player.type.js";
import type { PlayerAdminUpdate } from "@/modules/player/types/player-moderation.type.js";

/** GM chỉnh / khoá player: ghi DB rồi đá player đang online để vào lại với dữ liệu mới. */
export class PlayerModerationService {
    async update(playerId: string, body: PlayerAdminUpdate): Promise<Response<PlayerWithState>> {
        if (body.mapCode) await mapService.getActiveByCodeOrFail(body.mapCode);
        if (body.name) {
            const player = await PlayerIdentityRepo.findByIdOrFail({ id: playerId });
            const duplicated = await PlayerIdentityRepo.findByServerAndName({
                serverId: player.serverId,
                name: body.name,
                excludeId: playerId,
            });
            if (duplicated) return Response.error(PlayerErrorCode.PLAYER_NAME_EXISTS);
        }

        const { level, exp, hp, mp, mapCode, x, y, direction, ...authData } = body;
        const stateData = { level, exp, hp, mp, mapCode, x, y, direction };
        await withTransaction(async (tx) => {
            if (Object.keys(authData).length > 0) {
                await PlayerIdentityRepo.updateById({ id: playerId, data: authData, dbOrTx: tx });
            }
            if (Object.values(stateData).some((value) => value !== undefined)) {
                await PlayerStateRepo.updateByPlayerId(playerId, stateData, tx);
            }
        });
        const updated = await playerService.findWithStateById(playerId);
        if (Object.keys(body).length > 0) {
            playerKickService.kickPlayer(updated.userId, updated.id, KickReason.PLAYER_UPDATED);
        }
        return Response.success(updated);
    }

    async ban(playerId: string, reason?: string): Promise<Response<PlayerWithState>> {
        const player = await PlayerIdentityRepo.updateById({
            id: playerId,
            data: { status: PlayerStatus.BANNED, banReason: reason ?? null },
        });
        if (!player) return Response.error(CommonCode.NOT_FOUND);
        playerKickService.kickPlayer(player.userId, player.id, KickReason.BANNED);
        return Response.success(await playerService.findWithStateById(playerId));
    }
}

export const playerModerationService = new PlayerModerationService();
