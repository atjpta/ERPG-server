import type { Queryable } from "@/configs/postgres.config.js";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { serviceError } from "@/core/utils/service-error.js";
import { DEFAULT_GAME_SERVER_CODE } from "@/modules/auth/constants/game-server.constant.js";
import type { GameServer } from "@/modules/auth/entities/game-server.entity.js";
import { GameServerStatus } from "@/modules/auth/enums/game-server.enum.js";
import { GameServerRepo } from "@/modules/auth/repositories/game-server.repository.js";

export class GameServerService {
    async listVisible() {
        const servers = await GameServerRepo.findVisible();
        return servers.map(({ id, code, name, status }) => ({ id, code, name, status }));
    }

    /** Chỉ server `ONLINE` mới cho tạo player / vào game. */
    async getOnlineOrFail(id: string, dbOrTx?: Queryable) {
        const server = await GameServerRepo.findById({ id, dbOrTx });
        this.assertOnline(server);
        return server!;
    }

    async getDefaultOnlineOrFail(dbOrTx?: Queryable) {
        const server = await GameServerRepo.findByCode({ code: DEFAULT_GAME_SERVER_CODE, dbOrTx });
        this.assertOnline(server);
        return server!;
    }

    private assertOnline(server: GameServer | null) {
        if (!server || server.status !== GameServerStatus.ONLINE) {
            serviceError("Game server is unavailable", 503, ResponseCode.GAME_SERVER_UNAVAILABLE);
        }
    }
}

export const gameServerService = new GameServerService();
