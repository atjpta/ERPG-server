import { DateTime } from "luxon";
import type { Queryable } from "@/configs/postgres.config.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import { lockKeys } from "@/core/utils/db-lock.util.js";
import { Response } from "@/core/response/response.js";
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
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import {
    MailRewardSchema,
    type MailCod,
    type MailReward,
} from "@/modules/rewards/schemas/mail-reward.schema.js";
import type { SystemMailContent } from "@/modules/mails/types/mail.type.js";
import { MailErrorCode } from "@/modules/mails/enums/mail-error-code.enum.js";

/** Mã mẫu thư hệ thống mà mail tự dùng (seed `mail-template.seed.ts`). */
export const MailTemplateCode = {
    RETURNED: "mail_returned",
    COD_PAYMENT: "cod_payment",
} as const;

export class MailService {
    constructor(private readonly mailRepo: MailRepository = MailRepo) {}

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

    /**
     * Thư người chơi → người chơi, ghi cùng transaction với việc rút đính kèm khỏi người gửi. Khoá hộp thư người nhận rồi mới đếm và
     * ghi, nên nhiều người gửi đồng thời không vượt `maxInbox`; đầy thì trả `MAIL_TARGET_INBOX_FULL` (nơi gọi huỷ transaction của nó).
     * `id` cho phép đặt trước id thư (để lệnh ví tham chiếu được thư trước khi thư tồn tại).
     */
    async createPlayerMail(params: {
        id?: string;
        serverId: string;
        sender: { id: string; name: string };
        recipientId: string;
        subject: string;
        body: string;
        reward: MailReward | null;
        cod: MailCod | null;
        dbOrTx?: Queryable;
    }): Promise<Response<MailRow>> {
        const { id, serverId, sender, recipientId, subject, body, reward, cod, dbOrTx } = params;
        return withTransaction(async (tx) => {
            await lockKeys(tx, [`mail-inbox:${recipientId}`]);
            const used = await this.mailRepo.countPlayerInbox({
                recipientId,
                now: this.now(),
                dbOrTx: tx,
            });
            if (used >= this.config.maxInbox) {
                return Response.error(MailErrorCode.MAIL_TARGET_INBOX_FULL);
            }
            const created = await this.mailRepo.create({
                data: {
                    ...(id ? { id } : {}),
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
                dbOrTx: tx,
            });
            return Response.success(created);
        }, dbOrTx);
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

    isExpired(mail: MailRow): boolean {
        return mail.expiresAt.getTime() <= this.now().getTime();
    }

    // ------------------------------------------------------------------ nội bộ

    /** Thư hệ thống phải có mẫu thư tồn tại hoặc nội dung inline có đủ ngôn ngữ mặc định. */
    private async assertContent(params: SystemMailContent): Promise<void> {
        const { defaultLocale } = this.config;
        if (params.content) {
            if (!params.content[defaultLocale]) {
                Response.abort(CommonCode.INVALID_INPUT, { defaultLocale });
            }
            return;
        }
        if (!params.templateCode) {
            Response.abort(CommonCode.INVALID_INPUT);
        }
        const [template] = await MailTemplateRepo.findByCodes({ codes: [params.templateCode] });
        if (!template) {
            Response.abort(CommonCode.INVALID_INPUT, { templateCode: params.templateCode });
        }
    }

    /** Validate theo schema; thưởng rỗng thì không lưu. `exp` chưa claim được qua thư nên không cho khác 0. */
    private normalizeReward(reward?: MailReward | null): MailReward | null {
        if (!reward) return null;
        const parsed = MailRewardSchema.parse(reward);
        if (parsed.exp > 0) {
            Response.abort(CommonCode.INVALID_INPUT);
        }
        return parsed.items.length === 0 && parsed.currency.length === 0 ? null : parsed;
    }
}

export const mailService = new MailService();
