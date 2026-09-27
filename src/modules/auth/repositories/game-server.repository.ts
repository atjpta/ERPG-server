import { asc, eq, ne } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { GameServers } from "@/modules/auth/entities/game-server.entity.js";
import { GameServerStatus } from "@/modules/auth/enums/game-server.enum.js";

export class GameServerRepository extends BaseRepository<typeof GameServers> {
    constructor() {
        super(GameServers);
    }

    async findByCode(params: { code: string; dbOrTx?: Queryable }) {
        const { code, dbOrTx } = params;
        return this.findOne({ where: eq(GameServers.code, code), dbOrTx });
    }

    async findVisible(params: { dbOrTx?: Queryable } = {}) {
        const { dbOrTx = db } = params;
        return dbOrTx
            .select()
            .from(GameServers)
            .where(ne(GameServers.status, GameServerStatus.HIDDEN))
            .orderBy(asc(GameServers.sortOrder), asc(GameServers.createdAt));
    }
}

export const GameServerRepo = new GameServerRepository();
