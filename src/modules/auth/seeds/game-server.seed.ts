import { GameServers } from "@/modules/auth/entities/game-server.entity.js";
import { GameServerRepo } from "@/modules/auth/repositories/game-server.repository.js";

const SERVERS = [{ code: "s1", name: "S1 - Khởi Nguyên", sortOrder: 1 }];

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
