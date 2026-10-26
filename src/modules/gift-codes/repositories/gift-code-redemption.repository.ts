import { and, eq } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { GiftCodeRedemptions } from "@/modules/gift-codes/entities/gift-code-redemption.entity.js";

export class GiftCodeRedemptionRepository extends BaseRepository<typeof GiftCodeRedemptions> {
    constructor() {
        super(GiftCodeRedemptions);
    }

    /** Ghi biên nhận; `true` nếu đây là lần đầu của nhân vật với code này, `false` nếu đã có (kể cả gọi đồng thời). */
    async claim(params: { giftCodeId: string; playerId: string; dbOrTx?: Queryable }) {
        const { giftCodeId, playerId, dbOrTx = db } = params;
        const inserted = await dbOrTx
            .insert(GiftCodeRedemptions)
            .values({ giftCodeId, playerId })
            .onConflictDoNothing()
            .returning({ id: GiftCodeRedemptions.id });
        return inserted.length > 0;
    }

    /** Ghi lại thư đã gửi cho lượt nhập này. */
    async attachMail(params: {
        giftCodeId: string;
        playerId: string;
        mailId: string;
        dbOrTx?: Queryable;
    }) {
        const { giftCodeId, playerId, mailId, dbOrTx = db } = params;
        await dbOrTx
            .update(GiftCodeRedemptions)
            .set({ mailId })
            .where(
                and(
                    eq(GiftCodeRedemptions.giftCodeId, giftCodeId),
                    eq(GiftCodeRedemptions.playerId, playerId)
                )
            );
    }
}

export const GiftCodeRedemptionRepo = new GiftCodeRedemptionRepository();
