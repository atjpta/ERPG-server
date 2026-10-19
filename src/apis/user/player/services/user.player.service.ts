import { playerAuthService } from "@/modules/auth/services/player-auth.service.js";
import { KickReason } from "@/core/enums/kick-reason.enum.js";
import { playerKickService } from "@/core/services/player-kick.service.js";
import { playerService } from "@/modules/player/services/player.service.js";
import type { UserCreatePlayerBody } from "@/apis/user/player/validators/user.player.validator.js";

/** HTTP character-selection responses; player lifecycle and persistence stay in the module. */
export class UserPlayerService {
    async listCharacters(userId: string) {
        const [players, limits] = await Promise.all([
            playerService.listCharacters(userId),
            playerService.getCharacterLimits(),
        ]);
        return { players, ...limits };
    }

    async selectCharacter(params: { userId: string; sessionId: string; playerId: string }) {
        const { userId, sessionId, playerId } = params;
        const player = await playerService.getOwnedOrFail(userId, playerId);
        const playerToken = await playerAuthService.issueToken({
            userId,
            sessionId,
            playerId: player.id,
        });
        return { player: { id: player.id }, playerToken };
    }

    async deleteCharacter(params: { userId: string; playerId: string }) {
        const player = await playerService.deleteCharacter(params);
        // Throw out the character if it is online right now.
        playerKickService.kickPlayer(player.userId, player.id, KickReason.PLAYER_DELETED);
    }

    async createCharacter(params: {
        userId: string;
        sessionId: string;
        body: UserCreatePlayerBody;
    }) {
        const { userId, sessionId, body } = params;
        const player = await playerService.createCharacter({ userId, ...body });
        const playerToken = await playerAuthService.issueToken({
            userId,
            sessionId,
            playerId: player.id,
        });
        return { player, playerToken };
    }
}

export const userPlayerService = new UserPlayerService();
