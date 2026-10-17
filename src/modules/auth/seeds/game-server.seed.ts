import { GameServers } from "@/modules/auth/entities/game-server.entity.js";
import { GameServerRepo } from "@/modules/auth/repositories/game-server.repository.js";
import { SERVERS } from "@/modules/auth/seeds/game-server.seed-data.js";

export const GameServerSeed = async (force = false) => {
    for (const server of SERVERS) {
        await GameServerRepo.upsert({
            data: server,
            target: GameServers.code,
            matchValue: server.code,
            updateData: force ? server : undefined,
        });
    }
    console.info("✅ [GameServerSeed] Done");
};
