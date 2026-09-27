import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { DateTime } from "luxon";
import { env } from "@/configs/env.config.js";
import type { Queryable } from "@/configs/postgres.config.js";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import { BaseService } from "@/core/services/base.service.js";
import { serviceError } from "@/core/utils/service-error.js";
import { PLAYER_BASE_STATS } from "@/modules/auth/constants/player.constant.js";
import { Players, type Player } from "@/modules/auth/entities/player.entity.js";
import { Direction, PlayerStatus } from "@/modules/auth/enums/player.enum.js";
import { PlayerRepo } from "@/modules/auth/repositories/player.repository.js";
import { UserSessionRepo } from "@/modules/auth/repositories/user-session.repository.js";
import type { AuthPlayer } from "@/modules/auth/types/auth-user.type.js";
import { gameServerService } from "@/modules/auth/user/services/game-server.service.js";
import { mapService } from "@/modules/maps/user/services/map.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataService } from "@/modules/master-data/user/services/master-data.service.js";

const PLAYER_TOKEN_EXPIRES_IN = "30d";

export class PlayerService extends BaseService<typeof Players> {
    constructor() {
        super(PlayerRepo);
    }

    /**
     * Hiện tại 1 user = 1 player: trả player đầu tiên, chưa có thì tạo mới trên server mặc định
     * (tên tạm `Hero_xxxxxx`, người chơi đổi sau qua `PUT /players/me/name`).
     * Khi mở nhiều player/nhiều server: thay bằng luồng list → create → select.
     */
    async ensureDefault(userId: string, dbOrTx?: Queryable): Promise<Player> {
        return withTransaction(async (tx) => {
            const [existing] = await PlayerRepo.findByUserId({ userId, dbOrTx: tx });
            if (existing) return existing;

            const server = await gameServerService.getDefaultOnlineOrFail(tx);
            const config = await masterDataService.getValue(MasterDataKey.PLAYER_CONFIG, tx);
            const startMap = await mapService.getActiveByCodeOrFail(config.startMapCode, tx);

            return PlayerRepo.create({
                data: {
                    userId,
                    serverId: server.id,
                    name: `Hero_${randomBytes(3).toString("hex")}`,
                    hp: PLAYER_BASE_STATS.maxHp,
                    mp: PLAYER_BASE_STATS.maxMp,
                    mapCode: startMap.code,
                    x: startMap.spawnX,
                    y: startMap.spawnY,
                    direction: Direction.DOWN,
                },
                dbOrTx: tx,
            });
        }, dbOrTx);
    }

    /** Cấp player token (gắn với session đăng nhập — revoke session là token mất hiệu lực). */
    issueToken(params: { userId: string; sessionId: string; player: Player }) {
        const { userId, sessionId, player } = params;
        this.assertPlayable(player);

        const payload: Pick<
            AuthPlayer,
            "typ" | "userId" | "userSessionId" | "playerId" | "serverId"
        > = {
            typ: "player",
            userId,
            userSessionId: sessionId,
            playerId: player.id,
            serverId: player.serverId,
        };
        return jwt.sign(payload, env.JWT_SECRET, { expiresIn: PLAYER_TOKEN_EXPIRES_IN });
    }

    /** Verify chữ ký + session còn sống — dùng cho middleware và `onAuth` của room. */
    async verifyToken(token: string): Promise<AuthPlayer> {
        const payload = jwt.verify(token, env.JWT_SECRET) as AuthPlayer;
        if (payload.typ !== "player") throw new Error("Invalid token type");

        await this.assertSessionActive(payload);
        return payload;
    }

    /** Kiểm tra lại quyền chơi của 1 kết nối đang có (dùng khi reconnect — không đi qua `onAuth`). */
    async assertStillPlayable(auth: AuthPlayer) {
        await this.assertSessionActive(auth);
        await this.getPlayableOrFail(auth.playerId);
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

    async rename(playerId: string, name: string) {
        const player = await PlayerRepo.findByIdOrFail({
            id: playerId,
            message: "Player not found",
            code: ResponseCode.PLAYER_NOT_FOUND,
        });
        const duplicated = await PlayerRepo.findByServerAndName({
            serverId: player.serverId,
            name,
            excludeId: player.id,
        });
        if (duplicated) {
            serviceError("Player name is existed", 409, ResponseCode.PLAYER_NAME_EXISTS);
        }
        return PlayerRepo.updateById({ id: playerId, data: { name } });
    }

    /** Lấy player đang chơi được (dùng lúc join room). */
    async getPlayableOrFail(id: string) {
        const player = await PlayerRepo.findByIdOrFail({
            id,
            message: "Player not found",
            code: ResponseCode.PLAYER_NOT_FOUND,
        });
        this.assertPlayable(player);
        return player;
    }

    /** Lưu trạng thái khi rời map/logout. */
    async saveState(
        id: string,
        data: Pick<Player, "mapCode" | "x" | "y" | "direction" | "hp" | "mp">
    ) {
        return PlayerRepo.updateById({
            id,
            data: { ...data, lastPlayedAt: DateTime.now().toJSDate() },
        });
    }

    private assertPlayable(player: Player) {
        if (player.status === PlayerStatus.BANNED) {
            serviceError("Player is banned", 403, ResponseCode.PLAYER_BANNED);
        }
    }
}

export const playerService = new PlayerService();
