import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { GiftCodes } from "@/modules/gift-codes/entities/gift-code.entity.js";

export class GiftCodeRepository extends BaseRepository<typeof GiftCodes> {
    constructor() {
        super(GiftCodes);
    }

    /** Tìm theo mã (đã chuẩn hoá IN HOA). */
    findByCode(params: { code: string; dbOrTx?: Queryable }) {
        const { code, dbOrTx } = params;
        return this.findOne({ where: eq(GiftCodes.code, code), dbOrTx });
    }

    /** Tăng `used_count` nếu còn lượt; `false` khi đã đủ `max_uses` (kể cả khi nhiều người nhập đồng thời). */
    async incrementUsedIfAvailable(params: { id: string; dbOrTx?: Queryable }) {
        const { id, dbOrTx = db } = params;
        const updated = await dbOrTx
            .update(GiftCodes)
            .set({ usedCount: sql`${GiftCodes.usedCount} + 1` })
            .where(
                and(
                    eq(GiftCodes.id, id),
                    or(isNull(GiftCodes.maxUses), lt(GiftCodes.usedCount, GiftCodes.maxUses))
                )
            )
            .returning({ id: GiftCodes.id });
        return updated.length > 0;
    }
}

export const GiftCodeRepo = new GiftCodeRepository();
