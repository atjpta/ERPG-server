import { asc, sql } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { Levels, type NewLevel } from "@/modules/levels/entities/level.entity.js";

export class LevelRepository extends BaseRepository<typeof Levels> {
    constructor() {
        super(Levels);
    }

    async findAll(params: { dbOrTx?: Queryable } = {}) {
        const { dbOrTx = db } = params;
        return dbOrTx.select().from(Levels).orderBy(asc(Levels.level));
    }

    /** Ghi cả bảng exp một lần; `force` ghi đè exp của level đã có. */
    async upsertMany(params: { levels: NewLevel[]; force?: boolean; dbOrTx?: Queryable }) {
        const { levels, force = false, dbOrTx = db } = params;
        if (levels.length === 0) return;
        const insert = dbOrTx.insert(Levels).values(levels);
        await (force
            ? insert.onConflictDoUpdate({ target: Levels.level, set: { exp: sql`excluded.exp` } })
            : insert.onConflictDoNothing({ target: Levels.level }));
    }
}

export const LevelRepo = new LevelRepository();
