import { eq } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { MailBroadcastReceipts } from "@/modules/mails/entities/mail-broadcast-receipt.entity.js";

export class MailBroadcastReceiptRepository extends BaseRepository<typeof MailBroadcastReceipts> {
    constructor() {
        super(MailBroadcastReceipts);
    }

    /** Id các broadcast đã phát cho `playerId` (kể cả khi thư đã bị xoá). */
    async findBroadcastIds(params: { playerId: string; dbOrTx?: Queryable }) {
        const { playerId, dbOrTx = db } = params;
        const rows = await dbOrTx
            .select({ broadcastId: MailBroadcastReceipts.broadcastId })
            .from(MailBroadcastReceipts)
            .where(eq(MailBroadcastReceipts.playerId, playerId));
        return rows.map((row) => row.broadcastId);
    }

    /** Ghi biên nhận; `true` nếu đây là lần đầu (nơi gọi mới được tạo thư), `false` nếu đã có (gọi đồng thời). */
    async claimDelivery(params: { broadcastId: string; playerId: string; dbOrTx?: Queryable }) {
        const { broadcastId, playerId, dbOrTx = db } = params;
        const inserted = await dbOrTx
            .insert(MailBroadcastReceipts)
            .values({ broadcastId, playerId })
            .onConflictDoNothing()
            .returning({ id: MailBroadcastReceipts.id });
        return inserted.length > 0;
    }
}

export const MailBroadcastReceiptRepo = new MailBroadcastReceiptRepository();
