import { asc, eq } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { Items } from "@/modules/items/entities/item.entity.js";

export class ItemRepository extends BaseRepository<typeof Items> {
    constructor() {
        super(Items);
    }

    findByCode(params: { code: string; dbOrTx?: Queryable }) {
        return this.findOne({ where: eq(Items.code, params.code), dbOrTx: params.dbOrTx });
    }

    async findEnabled(params: { dbOrTx?: Queryable } = {}) {
        const dbOrTx = params.dbOrTx ?? db;
        return dbOrTx.select().from(Items).where(eq(Items.enabled, true)).orderBy(asc(Items.code));
    }
}

export const ItemRepo = new ItemRepository();
