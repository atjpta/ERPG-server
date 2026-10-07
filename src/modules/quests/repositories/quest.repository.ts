import { asc, eq } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { Quests } from "@/modules/quests/entities/quest.entity.js";

export class QuestRepository extends BaseRepository<typeof Quests> {
    constructor() {
        super(Quests);
    }

    findByCode(params: { code: string; dbOrTx?: Queryable }) {
        return this.findOne({ where: eq(Quests.code, params.code), dbOrTx: params.dbOrTx });
    }

    async findEnabled(params: { dbOrTx?: Queryable } = {}) {
        const dbOrTx = params.dbOrTx ?? db;
        return dbOrTx
            .select()
            .from(Quests)
            .where(eq(Quests.enabled, true))
            .orderBy(asc(Quests.code));
    }
}

export const QuestRepo = new QuestRepository();
