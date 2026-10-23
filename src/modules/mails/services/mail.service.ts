import { DateTime } from "luxon";
import type { Queryable } from "@/configs/postgres.config.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import { BaseService } from "@/core/services/base.service.js";
import { serviceError } from "@/core/utils/service-error.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import {
    MailBroadcasts,
    type MailBroadcastRow,
} from "@/modules/mails/entities/mail-broadcast.entity.js";
import { Mails, type MailRow } from "@/modules/mails/entities/mail.entity.js";
import { MailKind } from "@/modules/mails/enums/mail-kind.enum.js";
import { MailBroadcastReceiptRepo } from "@/modules/mails/repositories/mail-broadcast-receipt.repository.js";
import { MailBroadcastRepo } from "@/modules/mails/repositories/mail-broadcast.repository.js";
import { MailTemplateRepo } from "@/modules/mails/repositories/mail-template.repository.js";
import { MailRepo, type MailRepository } from "@/modules/mails/repositories/mail.repository.js";
import type { MailContent, MailParams } from "@/modules/mails/schemas/mail-content.schema.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import {
    MailRewardSchema,
    type MailCod,
    type MailReward,
} from "@/modules/rewards/schemas/mail-reward.schema.js";

/** Mã mẫu thư hệ thống mà mail tự dùng (seed `mail-template.seed.ts`). */
export const MailTemplateCode = {
    RETURNED: "mail_returned",
    COD_PAYMENT: "cod_payment",
} as const;

/** Nội dung của thư / broadcast hệ thống: mẫu thư (+ `params`) hoặc nội dung đa ngôn ngữ viết thẳng. */
export interface SystemMailContent {
    templateCode?: string;
    params?: MailParams;
    content?: MailContent;
}

export class MailService extends BaseService<typeof Mails> {
    constructor(private readonly mailRepo: MailRepository = MailRepo) {
        super(mailRepo);
    }

    private get config() {
        return masterDataCacheService.get(MasterDataKey.MAIL_CONFIG);
    }

    private now(): Date {
        return DateTime.now().toJSDate();
    }

    private expiry(days: number = this.config.retentionDays): Date {
        return DateTime.now().plus({ days }).toJSDate();
    }

    // ------------------------------------------------------------------ gửi

    /**
     * Gửi thư hệ thống cho một người chơi (offline cũng nhận): mẫu thư hoặc nội dung đa ngôn ngữ, kèm `reward` tuỳ ý
     * (đúng hình `Reward`). Không tính vào `maxInbox`. Dùng cho gift code, quà sự kiện, trả lại đính kèm...
     */
    async sendSystem(
        params: SystemMailContent & {
            serverId: string;
            recipientPlayerId: string;
            reward?: MailReward | null;
            expiresInDays?: number;
            dbOrTx?: Queryable;
        }
    ): Promise<MailRow> {
        const { serverId, recipientPlayerId, reward, expiresInDays, dbOrTx } = params;
        await this.assertContent(params);
        return this.mailRepo.create({
            data: {
                serverId,
                recipientPlayerId,
                kind: MailKind.SYSTEM,
                templateCode: params.templateCode ?? null,
                params: params.params ?? null,
                content: params.content ?? null,
                reward: this.normalizeReward(reward),
                expiresAt: this.expiry(expiresInDays),
            },
            dbOrTx,
        });
    }

    /** Gửi thưởng cho một người chơi bằng thư: `sendSystem` với `reward` bắt buộc. */
    sendReward(
        params: SystemMailContent & {
            serverId: string;
            recipientPlayerId: string;
            reward: MailReward;
            expiresInDays?: number;
            dbOrTx?: Queryable;
        }
    ): Promise<MailRow> {
        return this.sendSystem(params);
    }

    /**
     * Tạo broadcast cả server. Người chơi nhận thư khi vào game / mở hộp thư nếu broadcast còn hạn
     * (`materializeBroadcasts`); `skipNewPlayers` bỏ qua người tạo nhân vật sau lúc này.
     */
    async sendBroadcast(
        params: SystemMailContent & {
            serverId: string;
            reward?: MailReward | null;
            expiresInDays?: number;
            skipNewPlayers?: boolean;
        }
    ): Promise<MailBroadcastRow> {
        await this.assertContent(params);
        return MailBroadcastRepo.create({
            data: {
                serverId: params.serverId,
                templateCode: params.templateCode ?? null,
                params: params.params ?? null,
                content: params.content ?? null,
                reward: this.normalizeReward(params.reward),
                skipNewPlayers: params.skipNewPlayers ?? false,
                expiresAt: this.expiry(params.expiresInDays),
            } satisfies typeof MailBroadcasts.$inferInsert,
        });
    }

    /** Thư người chơi → người chơi (đã kiểm tra, đã rút đính kèm khỏi túi ở nơi gọi — ghi trong cùng transaction). */
    createPlayerMail(params: {
        serverId: string;
        sender: { id: string; name: string };
        recipientId: string;
        subject: string;
        body: string;
        reward: MailReward | null;
        cod: MailCod | null;
        dbOrTx?: Queryable;
    }): Promise<MailRow> {
        const { serverId, sender, recipientId, subject, body, reward, cod, dbOrTx } = params;
        return this.mailRepo.create({
            data: {
                serverId,
                recipientPlayerId: recipientId,
                kind: MailKind.PLAYER,
                senderPlayerId: sender.id,
                senderName: sender.name,
                subject,
                body,
                reward,
                cod,
                expiresAt: this.expiry(),
            },
            dbOrTx,
        });
    }

    /**
     * Trả đính kèm của thư `mail` về người gửi bằng thư hệ thống `mail_returned` (thu hồi, người nhận từ chối, hết hạn).
     * `null` khi thư không có đính kèm hoặc người gửi đã không còn.
     */
    async returnToSender(params: {
        mail: MailRow;
        recipientName: string;
        dbOrTx?: Queryable;
    }): Promise<MailRow | null> {
        const { mail, recipientName, dbOrTx } = params;
        if (!mail.reward || !mail.senderPlayerId) return null;
        return this.sendSystem({
            serverId: mail.serverId,
            recipientPlayerId: mail.senderPlayerId,
            templateCode: MailTemplateCode.RETURNED,
            params: { recipient: recipientName },
            reward: mail.reward,
            dbOrTx,
        });
    }

    /** Thư COD đã được nhận: tiền người nhận trả về người gửi bằng thư hệ thống `cod_payment`. */
    sendCodPayment(params: {
        mail: MailRow;
        payerName: string;
        dbOrTx?: Queryable;
    }): Promise<MailRow | null> {
        const { mail, payerName, dbOrTx } = params;
        if (!mail.cod || !mail.senderPlayerId) return Promise.resolve(null);
        return this.sendSystem({
            serverId: mail.serverId,
            recipientPlayerId: mail.senderPlayerId,
            templateCode: MailTemplateCode.COD_PAYMENT,
            params: { recipient: payerName },
            reward: {
                currency: [{ code: mail.cod.code, amount: mail.cod.amount }],
                items: [],
                source: ItemSource.MAIL,
                exp: 0,
            },
            dbOrTx,
        });
    }

    // ------------------------------------------------------------------ broadcast

    /**
     * Phát các broadcast còn hạn mà `playerId` chưa được phát (chạy khi mở hộp thư). "Đã phát" ghi ở biên nhận
     * (`mail_broadcast_receipts`), KHÔNG suy ra từ thư còn tồn tại — nếu không thì xoá thư là nhận lại quà. Biên nhận và thư ghi
     * trong cùng transaction; biên nhận có unique nên gọi đồng thời cũng chỉ tạo một thư. Trả các thư vừa tạo.
     */
    async materializeBroadcasts(params: {
        serverId: string;
        playerId: string;
        playerCreatedAt: Date;
    }): Promise<MailRow[]> {
        const { serverId, playerId, playerCreatedAt } = params;
        const [broadcasts, delivered] = await Promise.all([
            MailBroadcastRepo.findActive({ serverId, now: this.now() }),
            MailBroadcastReceiptRepo.findBroadcastIds({ playerId }),
        ]);
        const have = new Set(delivered);
        const created: MailRow[] = [];
        for (const broadcast of broadcasts) {
            if (have.has(broadcast.id)) continue;
            if (broadcast.skipNewPlayers && playerCreatedAt > broadcast.createdAt) continue;
            const mail = await withTransaction(async (tx) => {
                const first = await MailBroadcastReceiptRepo.claimDelivery({
                    broadcastId: broadcast.id,
                    playerId,
                    dbOrTx: tx,
                });
                if (!first) return null;
                return this.mailRepo.create({
                    data: {
                        serverId,
                        recipientPlayerId: playerId,
                        kind: MailKind.SYSTEM,
                        templateCode: broadcast.templateCode,
                        params: broadcast.params,
                        content: broadcast.content,
                        reward: broadcast.reward,
                        broadcastId: broadcast.id,
                        expiresAt: this.expiry(),
                    },
                    dbOrTx: tx,
                });
            });
            if (mail) created.push(mail);
        }
        return created;
    }

    // ------------------------------------------------------------------ hộp thư

    findOwned(params: Parameters<MailRepository["findOwned"]>[0]) {
        return this.mailRepo.findOwned(params);
    }

    listInbox(recipientId: string) {
        return this.mailRepo.findInbox({ recipientId, now: this.now() });
    }

    listSentUnclaimed(senderId: string) {
        return this.mailRepo.findSentUnclaimed({ senderId, now: this.now() });
    }

    countUnread(recipientId: string) {
        return this.mailRepo.countUnread({ recipientId, now: this.now() });
    }

    countPlayerInbox(recipientId: string) {
        return this.mailRepo.countPlayerInbox({ recipientId, now: this.now() });
    }

    async markRead(params: { mailId: string; recipientId: string }) {
        return (await this.mailRepo.markRead({ ...params, now: this.now() })).length > 0;
    }

    markClaimed(params: { mailId: string; recipientId: string; dbOrTx?: Queryable }) {
        return this.mailRepo.markClaimed({ ...params, now: this.now() });
    }

    deleteDeletable(params: Parameters<MailRepository["deleteDeletable"]>[0]) {
        return this.mailRepo.deleteDeletable(params);
    }

    deleteAllDeletable(params: Parameters<MailRepository["deleteAllDeletable"]>[0]) {
        return this.mailRepo.deleteAllDeletable(params);
    }

    deleteRecallable(params: Parameters<MailRepository["deleteRecallable"]>[0]) {
        return this.mailRepo.deleteRecallable(params);
    }

    deleteReturnable(params: Parameters<MailRepository["deleteReturnable"]>[0]) {
        return this.mailRepo.deleteReturnable(params);
    }

    isExpired(mail: MailRow): boolean {
        return mail.expiresAt.getTime() <= this.now().getTime();
    }

    // ------------------------------------------------------------------ hết hạn

    /**
     * Xoá thư hết hạn của server. Thư người chơi còn đính kèm chưa nhận được trả về người gửi (thư hệ thống
     * `mail_returned`); thư hệ thống / đã nhận xoá thẳng. Trả các thư "trả lại" vừa tạo để báo người gửi đang online.
     */
    async sweepExpired(params: { serverId: string; limit?: number }): Promise<MailRow[]> {
        const expired = await this.mailRepo.findExpired({
            serverId: params.serverId,
            now: this.now(),
            limit: params.limit ?? 500,
        });
        const returned: MailRow[] = [];
        for (const mail of expired) {
            const created = await withTransaction(async (tx) => {
                // Chỉ người xoá thành công mới trả đính kèm: tránh trả hai lần khi trùng với thao tác khác.
                if (!(await this.mailRepo.deleteExpiredOne({ mailId: mail.id, dbOrTx: tx }))) {
                    return null;
                }
                const refundable = mail.kind === MailKind.PLAYER && !mail.claimedAt && mail.reward;
                if (!refundable) return null;
                const recipient = await PlayerIdentityRepo.findById({
                    id: mail.recipientPlayerId,
                    dbOrTx: tx,
                });
                return this.returnToSender({
                    mail,
                    recipientName: recipient?.name ?? "",
                    dbOrTx: tx,
                });
            });
            if (created) returned.push(created);
        }
        return returned;
    }

    // ------------------------------------------------------------------ nội bộ

    /** Thư hệ thống phải có mẫu thư tồn tại hoặc nội dung inline có đủ ngôn ngữ mặc định. */
    private async assertContent(params: SystemMailContent): Promise<void> {
        const { defaultLocale } = this.config;
        if (params.content) {
            if (!params.content[defaultLocale]) {
                serviceError(
                    `System mail content must include the default locale "${defaultLocale}"`,
                    400,
                    CommonCode.INVALID_INPUT
                );
            }
            return;
        }
        if (!params.templateCode) {
            serviceError(
                "System mail needs a templateCode or content",
                400,
                CommonCode.INVALID_INPUT
            );
        }
        const [template] = await MailTemplateRepo.findByCodes({ codes: [params.templateCode] });
        if (!template) {
            serviceError(
                `Unknown mail template "${params.templateCode}"`,
                400,
                CommonCode.INVALID_INPUT
            );
        }
    }

    /** Validate theo schema; thưởng rỗng thì không lưu. `exp` chưa claim được qua thư nên không cho khác 0. */
    private normalizeReward(reward?: MailReward | null): MailReward | null {
        if (!reward) return null;
        const parsed = MailRewardSchema.parse(reward);
        if (parsed.exp > 0) {
            serviceError("Mail rewards cannot carry exp yet", 400, CommonCode.INVALID_INPUT);
        }
        return parsed.items.length === 0 && parsed.currency.length === 0 ? null : parsed;
    }
}

export const mailService = new MailService();
