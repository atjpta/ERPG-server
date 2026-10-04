import { asc, eq } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { Classes } from "@/modules/classes/entities/class.entity.js";

export class ClassRepository extends BaseRepository<typeof Classes> {
    constructor() {
        super(Classes);
    }

    findByCode(params: { code: string; dbOrTx?: Queryable }) {
        return this.findOne({ where: eq(Classes.code, params.code), dbOrTx: params.dbOrTx });
    }

    async findEnabled(params: { dbOrTx?: Queryable } = {}) {
        const dbOrTx = params.dbOrTx ?? db;
        return dbOrTx
            .select()
            .from(Classes)
            .where(eq(Classes.enabled, true))
            .orderBy(asc(Classes.tier), asc(Classes.code));
    }
}

export const ClassRepo = new ClassRepository();
