import { asc, eq } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { GameMaps } from "@/modules/maps/entities/game-map.entity.js";
import { MapStatus } from "@/modules/maps/enums/map.enum.js";

export class GameMapRepository extends BaseRepository<typeof GameMaps> {
    constructor() {
        super(GameMaps);
    }

    async findByCode(params: { code: string; dbOrTx?: Queryable }) {
        const { code, dbOrTx } = params;
        return this.findOne({ where: eq(GameMaps.code, code), dbOrTx });
    }

    async findActive(params: { dbOrTx?: Queryable } = {}) {
        const { dbOrTx = db } = params;
        return dbOrTx
            .select()
            .from(GameMaps)
            .where(eq(GameMaps.status, MapStatus.ACTIVE))
            .orderBy(asc(GameMaps.code));
    }
}

export const GameMapRepo = new GameMapRepository();
