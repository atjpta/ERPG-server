import jwt from "jsonwebtoken";
import { env } from "@/configs/env.config.js";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { serviceError } from "@/core/utils/service-error.js";
import { PlayerStatus } from "@/modules/auth/enums/player-status.enum.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { UserSessionRepo } from "@/modules/auth/repositories/user-session.repository.js";
import type { AuthPlayer } from "@/modules/auth/types/auth-user.type.js";

const PLAYER_TOKEN_EXPIRES_IN = "30d";

/** Issues and verifies tokens that bind an authenticated account session to a player identity. */
export class PlayerAuthService {
    async issueToken(params: { userId: string; sessionId: string; playerId: string }) {
        const { userId, sessionId, playerId } = params;
        const player = await this.getPlayableIdentity(playerId);
        const payload: Pick<
            AuthPlayer,
            "typ" | "userId" | "userSessionId" | "playerId" | "serverId"
        > = {
            typ: "player",
            userId,
            userSessionId: sessionId,
            playerId,
            serverId: player.serverId,
        };
        return jwt.sign(payload, env.JWT_SECRET, { expiresIn: PLAYER_TOKEN_EXPIRES_IN });
    }

    async verifyToken(token: string): Promise<AuthPlayer> {
        const payload = jwt.verify(token, env.JWT_SECRET) as AuthPlayer;
        if (payload.typ !== "player") throw new Error("Invalid token type");
        await this.assertSessionActive(payload);
        return payload;
    }

    async assertStillPlayable(auth: AuthPlayer) {
        await this.assertSessionActive(auth);
        await this.getPlayableIdentity(auth.playerId);
    }

    private async getPlayableIdentity(playerId: string) {
        const player = await PlayerIdentityRepo.findByIdOrFail({
            id: playerId,
            message: "Player not found",
            code: ResponseCode.PLAYER_NOT_FOUND,
        });
        if (player.status === PlayerStatus.BANNED) {
            serviceError("Player is banned", 403, ResponseCode.PLAYER_BANNED);
        }
        return player;
    }

    private async assertSessionActive({
        userSessionId,
        userId,
    }: Pick<AuthPlayer, "userSessionId" | "userId">) {
        const session = await UserSessionRepo.findById({ id: userSessionId });
        if (!session || session.revoked || session.userId !== userId) {
            throw new Error("Session revoked");
        }
    }
}

export const playerAuthService = new PlayerAuthService();
