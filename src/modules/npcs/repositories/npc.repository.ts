import { asc, eq } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { Npcs } from "@/modules/npcs/entities/npc.entity.js";

export class NpcRepository extends BaseRepository<typeof Npcs> {
    constructor() {
        super(Npcs);
    }

    findByCode(params: { code: string; dbOrTx?: Queryable }) {
        return this.findOne({ where: eq(Npcs.code, params.code), dbOrTx: params.dbOrTx });
    }

    async findEnabled(params: { dbOrTx?: Queryable } = {}) {
        const dbOrTx = params.dbOrTx ?? db;
        return dbOrTx.select().from(Npcs).where(eq(Npcs.enabled, true)).orderBy(asc(Npcs.code));
    }
}

export const NpcRepo = new NpcRepository();
