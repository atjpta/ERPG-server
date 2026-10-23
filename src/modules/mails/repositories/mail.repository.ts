import { and, desc, eq, gt, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { Mails } from "@/modules/mails/entities/mail.entity.js";
import { MailKind } from "@/modules/mails/enums/mail-kind.enum.js";

export class MailRepository extends BaseRepository<typeof Mails> {
    constructor() {
        super(Mails);
    }

    /** Thư của `recipientId` (không tính hết hạn trừ khi `includeExpired`). */
    async findOwned(params: { mailId: string; recipientId: string; dbOrTx?: Queryable }) {
        const { mailId, recipientId, dbOrTx } = params;
        return this.findOne({
            where: and(eq(Mails.id, mailId), eq(Mails.recipientPlayerId, recipientId))!,
            dbOrTx,
        });
    }

    /** Hộp thư còn hạn, mới → cũ. */
    async findInbox(params: { recipientId: string; now: Date; dbOrTx?: Queryable }) {
        const { recipientId, now, dbOrTx = db } = params;
        return dbOrTx
            .select()
            .from(Mails)
            .where(and(eq(Mails.recipientPlayerId, recipientId), gt(Mails.expiresAt, now)))
            .orderBy(desc(Mails.id));
    }

    /** Thư người chơi `senderId` đã gửi mà người nhận chưa claim (còn thu hồi được), mới → cũ. */
    async findSentUnclaimed(params: { senderId: string; now: Date; dbOrTx?: Queryable }) {
        const { senderId, now, dbOrTx = db } = params;
        return dbOrTx
            .select()
            .from(Mails)
            .where(
                and(
                    eq(Mails.senderPlayerId, senderId),
                    eq(Mails.kind, MailKind.PLAYER),
                    isNull(Mails.claimedAt),
                    gt(Mails.expiresAt, now)
                )
            )
            .orderBy(desc(Mails.id));
    }

    async countUnread(params: { recipientId: string; now: Date; dbOrTx?: Queryable }) {
        const { recipientId, now, dbOrTx } = params;
        return this.count({
            where: and(
                eq(Mails.recipientPlayerId, recipientId),
                isNull(Mails.readAt),
                gt(Mails.expiresAt, now)
            )!,
            dbOrTx,
        });
    }

    /** Số thư người chơi trong hộp thư (thư hệ thống không tính vào giới hạn). */
    async countPlayerInbox(params: { recipientId: string; now: Date; dbOrTx?: Queryable }) {
        const { recipientId, now, dbOrTx } = params;
        return this.count({
            where: and(
                eq(Mails.recipientPlayerId, recipientId),
                eq(Mails.kind, MailKind.PLAYER),
                gt(Mails.expiresAt, now)
            )!,
            dbOrTx,
        });
    }

    async markRead(params: { mailId: string; recipientId: string; now: Date; dbOrTx?: Queryable }) {
        const { mailId, recipientId, now, dbOrTx = db } = params;
        return dbOrTx
            .update(Mails)
            .set({ readAt: now })
            .where(
                and(
                    eq(Mails.id, mailId),
                    eq(Mails.recipientPlayerId, recipientId),
                    isNull(Mails.readAt)
                )
            )
            .returning({ id: Mails.id });
    }

    /**
     * Đánh dấu đã nhận (kiêm đã đọc) — có điều kiện nên chỉ một lệnh thắng nếu claim / thu hồi chạy đồng thời.
     * `null` = thư đã nhận, đã hết hạn, đã bị thu hồi hoặc không phải của người này.
     */
    async markClaimed(params: {
        mailId: string;
        recipientId: string;
        now: Date;
        dbOrTx?: Queryable;
    }) {
        const { mailId, recipientId, now, dbOrTx = db } = params;
        const [row] = await dbOrTx
            .update(Mails)
            .set({
                claimedAt: now,
                readAt: sql`coalesce(${Mails.readAt}, ${now.toISOString()})`,
            })
            .where(
                and(
                    eq(Mails.id, mailId),
                    eq(Mails.recipientPlayerId, recipientId),
                    isNull(Mails.claimedAt),
                    gt(Mails.expiresAt, now)
                )
            )
            .returning();
        return row ?? null;
    }

    /** Xoá được khi đã đọc và (không có đính kèm hoặc đã nhận). */
    async deleteDeletable(params: { mailId: string; recipientId: string; dbOrTx?: Queryable }) {
        const { mailId, recipientId, dbOrTx = db } = params;
        const [row] = await dbOrTx
            .delete(Mails)
            .where(
                and(
                    eq(Mails.id, mailId),
                    eq(Mails.recipientPlayerId, recipientId),
                    isNotNull(Mails.readAt),
                    or(isNull(Mails.reward), isNotNull(Mails.claimedAt))
                )
            )
            .returning({ id: Mails.id });
        return row ?? null;
    }

    /** Xoá mọi thư xoá được của người nhận; trả id đã xoá. */
    async deleteAllDeletable(params: { recipientId: string; dbOrTx?: Queryable }) {
        const { recipientId, dbOrTx = db } = params;
        return dbOrTx
            .delete(Mails)
            .where(
                and(
                    eq(Mails.recipientPlayerId, recipientId),
                    isNotNull(Mails.readAt),
                    or(isNull(Mails.reward), isNotNull(Mails.claimedAt))
                )
            )
            .returning({ id: Mails.id });
    }

    /** Xoá thư người chơi chưa claim do `senderId` gửi (thu hồi) — trả dòng đã xoá; `null` nếu không còn thu hồi được. */
    async deleteRecallable(params: { mailId: string; senderId: string; dbOrTx?: Queryable }) {
        const { mailId, senderId, dbOrTx = db } = params;
        const [row] = await dbOrTx
            .delete(Mails)
            .where(
                and(
                    eq(Mails.id, mailId),
                    eq(Mails.senderPlayerId, senderId),
                    eq(Mails.kind, MailKind.PLAYER),
                    isNull(Mails.claimedAt)
                )
            )
            .returning();
        return row ?? null;
    }

    /** Người nhận từ chối / trả lại: xoá thư người chơi chưa claim của họ (và còn người gửi để trả). */
    async deleteReturnable(params: { mailId: string; recipientId: string; dbOrTx?: Queryable }) {
        const { mailId, recipientId, dbOrTx = db } = params;
        const [row] = await dbOrTx
            .delete(Mails)
            .where(
                and(
                    eq(Mails.id, mailId),
                    eq(Mails.recipientPlayerId, recipientId),
                    eq(Mails.kind, MailKind.PLAYER),
                    isNull(Mails.claimedAt)
                )
            )
            .returning();
        return row ?? null;
    }

    /** Thư hết hạn của server : cũ trước để dọn tồn đọng theo lô. */
    async findExpired(params: { serverId: string; now: Date; limit: number; dbOrTx?: Queryable }) {
        const { serverId, now, limit, dbOrTx = db } = params;
        return dbOrTx
            .select()
            .from(Mails)
            .where(and(eq(Mails.serverId, serverId), lte(Mails.expiresAt, now)))
            .orderBy(Mails.id)
            .limit(limit);
    }

    /** Xoá một thư hết hạn; `null` nếu đã bị xoá ở nơi khác (tránh trả đính kèm hai lần). */
    async deleteExpiredOne(params: { mailId: string; dbOrTx?: Queryable }) {
        const { mailId, dbOrTx = db } = params;
        const [row] = await dbOrTx.delete(Mails).where(eq(Mails.id, mailId)).returning();
        return row ?? null;
    }
}

export const MailRepo = new MailRepository();
