import { asc, eq } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { Monsters } from "@/modules/monsters/entities/monster.entity.js";

export class MonsterRepository extends BaseRepository<typeof Monsters> {
    constructor() {
        super(Monsters);
    }

    async findByCode(params: { code: string; dbOrTx?: Queryable }) {
        const { code, dbOrTx } = params;
        return this.findOne({ where: eq(Monsters.code, code), dbOrTx });
    }

    async findAll(params: { dbOrTx?: Queryable } = {}) {
        const { dbOrTx = db } = params;
        return dbOrTx.select().from(Monsters).orderBy(asc(Monsters.code));
    }
}

export const MonsterRepo = new MonsterRepository();
