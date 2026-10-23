import { DateTime } from "luxon";
import type { Queryable } from "@/configs/postgres.config.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import type { MailRow } from "@/modules/mails/entities/mail.entity.js";
import { MailKind } from "@/modules/mails/enums/mail-kind.enum.js";
import { MailRepo, type MailRepository } from "@/modules/mails/repositories/mail.repository.js";
import { mailService, type MailService } from "@/modules/mails/services/mail.service.js";

/** Vì sao thao tác lên thư không thực hiện được (cho command đổi thành mã lỗi). */
export type MailTransferFailureReason = "claimed" | "not_found" | "not_returnable";

export interface MailTransferFailure {
    failure: MailTransferFailureReason;
}

export const isMailTransferFailure = (value: unknown): value is MailTransferFailure =>
    typeof value === "object" && value !== null && "failure" in value;

/** Kết quả thu hồi / trả lại: thư gốc đã xoá và thư hoàn trả cho người gửi (đính kèm quay về). */
export interface MailReturnOutcome {
    deleted: MailRow;
    returned: MailRow | null;
}

/**
 * Các bước giao hàng của thư. Tiền / item của người chơi nằm trong `PlayerRuntime`, nên mỗi bước là MỘT transaction DB
 * cùng với thay đổi của người chơi (`PlayerRuntimeService.transact`) — không còn trạng thái dở dang cần đối soát:
 *  - gửi: rút đính kèm khỏi người gửi + tạo thư;
 *  - nhận: cộng đính kèm / trừ giá COD của người nhận + đánh dấu đã nhận CÓ ĐIỀU KIỆN + thư thanh toán COD cho người gửi;
 *  - thu hồi / trả lại / hết hạn: xoá có điều kiện + thư hoàn trả cho người gửi.
 * Mọi thao tác kết thúc thư là câu lệnh có điều kiện nên chạy đồng thời chỉ một bên thắng (DB phân xử).
 */
export class MailTransferService {
    constructor(
        private readonly mails: MailService = mailService,
        private readonly mailRepo: MailRepository = MailRepo
    ) {}

    private now(): Date {
        return DateTime.now().toJSDate();
    }

    /**
     * Đánh dấu đã nhận (có điều kiện: chưa nhận, chưa hết hạn, chưa bị thu hồi) và tạo thư thanh toán COD cho người gửi, trong
     * transaction `tx` của nơi gọi (cùng lúc lưu túi / ví người nhận). `null` = thư không còn nhận được — nơi gọi huỷ transaction.
     */
    async claimInTransaction(params: {
        mail: MailRow;
        recipientId: string;
        payerName: string;
        tx: Queryable;
    }): Promise<{ payment: MailRow | null } | null> {
        const { mail, recipientId, payerName, tx } = params;
        const claimed = await this.mailRepo.markClaimed({
            mailId: mail.id,
            recipientId,
            now: this.now(),
            dbOrTx: tx,
        });
        if (!claimed) return null;
        const payment = mail.cod
            ? await this.mails.sendCodPayment({ mail, payerName, dbOrTx: tx })
            : null;
        return { payment };
    }

    /** Người gửi thu hồi thư chưa nhận (đã đọc vẫn được). */
    async recall(params: {
        mailId: string;
        senderId: string;
    }): Promise<MailReturnOutcome | MailTransferFailure> {
        const { mailId, senderId } = params;
        const outcome = await withTransaction(async (tx) => {
            const deleted = await this.mailRepo.deleteRecallable({ mailId, senderId, dbOrTx: tx });
            if (!deleted) return null;
            const recipient = await PlayerIdentityRepo.findById({
                id: deleted.recipientPlayerId,
                dbOrTx: tx,
            });
            return this.finishDeleted(deleted, recipient?.name ?? "", tx);
        });
        if (outcome) return outcome;

        const existing = await this.mailRepo.findById({ id: mailId });
        if (existing?.senderPlayerId !== senderId) return { failure: "not_found" };
        return { failure: existing.claimedAt ? "claimed" : "not_found" };
    }

    /** Người nhận từ chối / trả lại thư người chơi chưa nhận; đính kèm về người gửi. */
    async returnMail(params: {
        mailId: string;
        recipientId: string;
        recipientName: string;
    }): Promise<MailReturnOutcome | MailTransferFailure> {
        const { mailId, recipientId, recipientName } = params;
        const outcome = await withTransaction(async (tx) => {
            const deleted = await this.mailRepo.deleteReturnable({
                mailId,
                recipientId,
                dbOrTx: tx,
            });
            if (!deleted) return null;
            return this.finishDeleted(deleted, recipientName, tx);
        });
        if (outcome) return outcome;

        const existing = await this.mailRepo.findById({ id: mailId });
        if (existing?.recipientPlayerId !== recipientId) return { failure: "not_found" };
        if (existing.kind !== MailKind.PLAYER) return { failure: "not_returnable" };
        return { failure: existing.claimedAt ? "claimed" : "not_found" };
    }

    /**
     * Dọn thư hết hạn của server theo lô cho tới khi hết (hoặc hết `maxBatches` lượt/lần gọi — lần sau làm tiếp). Thư người chơi còn
     * đính kèm chưa nhận → trả về người gửi. Làm lại an toàn: mỗi thư xoá có điều kiện.
     */
    async sweepExpired(params: {
        serverId: string;
        batchSize?: number;
        maxBatches?: number;
    }): Promise<{ swept: number; returned: MailRow[] }> {
        const { serverId, batchSize = 200, maxBatches = 50 } = params;
        const returned: MailRow[] = [];
        let swept = 0;
        for (let batch = 0; batch < maxBatches; batch++) {
            const expired = await this.mailRepo.findExpired({
                serverId,
                now: this.now(),
                limit: batchSize,
            });
            let progressed = 0;
            for (const mail of expired) {
                try {
                    const outcome = await withTransaction(async (tx) => {
                        const deleted = await this.mailRepo.deleteExpiredOne({
                            mailId: mail.id,
                            dbOrTx: tx,
                        });
                        if (!deleted) return null;
                        // Chỉ thư người chơi chưa nhận mới có gì để trả; thư hệ thống hoặc đã nhận xoá thẳng.
                        if (deleted.kind !== MailKind.PLAYER || deleted.claimedAt) {
                            return { deleted, returned: null };
                        }
                        const recipient = await PlayerIdentityRepo.findById({
                            id: deleted.recipientPlayerId,
                            dbOrTx: tx,
                        });
                        return this.finishDeleted(deleted, recipient?.name ?? "", tx);
                    });
                    if (!outcome) continue;
                    progressed++;
                    if (outcome.returned) returned.push(outcome.returned);
                } catch (error) {
                    console.error(`[Mail] Sweep of expired mail ${mail.id} failed:`, error);
                }
            }
            swept += progressed;
            if (expired.length < batchSize || progressed === 0) break;
        }
        return { swept, returned };
    }

    /** Thư vừa xoá (thu hồi / trả lại / hết hạn): trả đính kèm cho người gửi — trong transaction của nơi gọi. */
    private async finishDeleted(
        deleted: MailRow,
        recipientName: string,
        tx: Queryable
    ): Promise<MailReturnOutcome> {
        const returned = await this.mails.returnToSender({
            mail: deleted,
            recipientName,
            dbOrTx: tx,
        });
        return { deleted, returned };
    }
}

export const mailTransferService = new MailTransferService();
