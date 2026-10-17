import { GameServerRepo } from "@/modules/auth/repositories/game-server.repository.js";
export class UserGameServerService {
    async listVisible() {
        const servers = await GameServerRepo.findVisible();
        return servers.map(({ id, code, status }) => ({ id, code, status }));
    }
}

export const userGameServerService = new UserGameServerService();
