import { playerAuthService } from "@/modules/auth/services/player-auth.service.js";
import { Response } from "@/core/response/response.js";
import { KickReason } from "@/core/enums/kick-reason.enum.js";
import { playerKickService } from "@/core/services/player-kick.service.js";
import { playerRenameService } from "@/core/services/player-rename.service.js";
import { playerService } from "@/modules/player/services/player.service.js";

/** Chọn / tạo / đổi tên / xoá nhân vật của user: ghi DB rồi cấp token, đá hoặc báo các room đang giữ nhân vật. */
export class CharacterService {
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

    /** Đổi tên nhân vật rồi báo các room đang giữ người đó (world, global) cập nhật tên trong phiên. */
    async renameCharacter(params: { playerId: string; name: string }) {
        const result = await playerService.rename(params.playerId, params.name);
        if (Response.isError(result)) return result;
        playerRenameService.publish(params.playerId, result.data.name);
        return result;
    }

    async createCharacter(params: {
        userId: string;
        sessionId: string;
        body: { name: string; classCode: string };
    }) {
        const { userId, sessionId, body } = params;
        const created = await playerService.createCharacter({ userId, ...body });
        if (Response.isError(created)) return created;
        const player = created.data;
        const playerToken = await playerAuthService.issueToken({
            userId,
            sessionId,
            playerId: player.id,
        });
        return Response.success({ player, playerToken });
    }
}

export const characterService = new CharacterService();
