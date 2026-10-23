import { generateEntityId } from "@/core/entities/base.entity.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import { callRoom } from "@/core/rooms/room.integration.js";
import type { Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import type { MailRow } from "@/modules/mails/entities/mail.entity.js";
import { MailErrorCode } from "@/modules/mails/enums/mail-error-code.enum.js";
import {
    mailRenderService,
    type RenderedMail,
} from "@/modules/mails/services/mail-render.service.js";
import { mailService } from "@/modules/mails/services/mail.service.js";
import type { MailReward } from "@/modules/rewards/schemas/mail-reward.schema.js";
import type { ItemReward } from "@/modules/rewards/types/reward.type.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import type { ItemRewardMessage } from "@/rooms/global/modules/inventory/interfaces/inventory.global.message.js";
import { inventoryGlobalService } from "@/rooms/global/modules/inventory/services/inventory.global.service.js";
import type {
    MailClaimedMessage,
    MailCurrencyMessage,
    MailMessage,
    MailReceivedMessage,
    MailRewardMessage,
} from "@/rooms/global/modules/mail/interfaces/mail.global.message.js";
import type { PlayerDataState } from "@/rooms/global/modules/player-data/schemas/player-data.global.state.js";
import { playerDataGlobalService } from "@/rooms/global/modules/player-data/services/player-data.global.service.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import {
    CreditWalletWorldCommand,
    DebitWalletWorldCommand,
} from "@/rooms/world/modules/players/commands/wallet.world.command.js";

/** Ném trong transaction nhận thư khi thư đã bị thu hồi giữa chừng: huỷ transaction rồi hoàn ví. */
class MailGoneError extends Error {}

/**
 * Phần dùng chung của các command mail trong global room: dựng DTO, push thư mới và nhận một thư (`claimOne`, dùng cho cả
 * `mailClaim` lẫn `mailClaimAll`). Logic chỉ một command dùng nằm ngay trong command đó; luật nghiệp vụ nằm ở `modules/mails`.
 *
 * Thao tác tiền đi qua world (`DebitWalletWorldCommand` / `CreditWalletWorldCommand`) với `eventId` mới cho mỗi lần thử —
 * world nhớ `eventId` đã áp dụng, dùng lại id cũ sau một lần hoàn tiền sẽ bị coi là lặp và không trừ nữa.
 */
export class MailGlobalService {
    // ------------------------------------------------------------------ DTO

    toCurrencyMessage(entry: {
        code: MailCurrencyMessage["code"];
        amount: number;
    }): MailCurrencyMessage {
        return { code: entry.code, amount: entry.amount };
    }

    toItemMessage(item: ItemReward): ItemRewardMessage {
        // Không để khoá `metadata: undefined`: msgpack mã hoá nó thành giá trị lạ mà client Unity không đọc được.
        const { metadata, ...base } = inventoryGlobalService.toItemRewardMessage(item);
        return {
            ...base,
            ...(metadata ? { metadata: inventoryGlobalService.toInstanceMessage(metadata) } : {}),
        };
    }

    toRewardMessage(reward: MailReward): MailRewardMessage {
        return {
            items: reward.items.map((item) => this.toItemMessage(item)),
            currency: reward.currency.map((entry) => this.toCurrencyMessage(entry)),
        };
    }

    toMailMessage(row: MailRow, rendered: RenderedMail): MailMessage {
        return {
            id: row.id,
            kind: row.kind,
            ...(row.senderPlayerId ? { senderId: row.senderPlayerId } : {}),
            ...(row.senderName ? { senderName: row.senderName } : {}),
            subject: rendered.subject,
            body: rendered.body,
            locale: rendered.locale,
            ...(row.reward ? { reward: this.toRewardMessage(row.reward) } : {}),
            ...(row.cod ? { cod: this.toCurrencyMessage(row.cod) } : {}),
            read: row.readAt !== null,
            claimed: row.claimedAt !== null,
            createdAt: row.createdAt.getTime(),
            expiresAt: row.expiresAt.getTime(),
        };
    }

    // ------------------------------------------------------------------ push

    /** Báo `row.recipientPlayerId` có thư mới (nếu đang kết nối global), dựng theo ngôn ngữ họ đã dùng gần nhất. */
    async notifyReceived(room: GlobalRoom, row: MailRow): Promise<void> {
        const client = room.clientOf(row.recipientPlayerId);
        if (!client) return;
        const locale = room.state.mails.localeOf(row.recipientPlayerId);
        const rendered = (await mailRenderService.renderMany([row], locale)).get(row.id)!;
        const data: MailReceivedMessage = {
            mail: this.toMailMessage(row, rendered),
            unreadCount: await mailService.countUnread(row.recipientPlayerId),
        };
        client.sendSuccess(GlobalMessage.MAIL_RECEIVED, data);
    }

    // ------------------------------------------------------------------ nhận

    /**
     * Nhận một thư (đã giữ `exclusive` của người nhận). Thứ tự: kiểm tra chỗ túi → trừ giá COD ở world → cộng tiền đính kèm ở
     * world → transaction { lưu túi, đánh dấu đã nhận có điều kiện, thư thanh toán COD cho người gửi }. Lỗi ở bước sau thì hoàn
     * lại các bước trước (túi, ví).
     */
    async claimOne(
        room: GlobalRoom,
        state: PlayerDataState,
        mail: MailRow
    ): Promise<Result<MailClaimedMessage>> {
        const reward = mail.reward!;
        const playerId = state.playerId;
        const work = state.workingCopy();
        if (!work.canFit(reward.items)) return Response.error(ItemErrorCode.INVENTORY_FULL);

        const needsWallet = reward.currency.length > 0 || !!mail.cod;
        const worldRoomId = state.worldRoomId;
        if (needsWallet && !worldRoomId) return Response.error(MailErrorCode.MAIL_NEEDS_WORLD);

        const attempt = generateEntityId();
        const codEventId = `mail-cod:${mail.id}:${attempt}`;
        const creditEventId = `mail:${mail.id}:${attempt}`;
        const undoCod = async () => {
            if (mail.cod && worldRoomId) {
                await callRoom(worldRoomId, CreditWalletWorldCommand, {
                    eventId: `${codEventId}:undo`,
                    playerId,
                    currencies: [mail.cod],
                });
            }
        };
        const undoCredit = async () => {
            if (reward.currency.length > 0 && worldRoomId) {
                await callRoom(worldRoomId, DebitWalletWorldCommand, {
                    eventId: `${creditEventId}:undo`,
                    playerId,
                    currencies: reward.currency,
                });
            }
        };

        if (mail.cod) {
            const debited = await callRoom(worldRoomId, DebitWalletWorldCommand, {
                eventId: codEventId,
                playerId,
                currencies: [mail.cod],
            });
            if (Response.isError(debited)) return debited;
        }
        if (reward.currency.length > 0) {
            const credited = await callRoom(worldRoomId, CreditWalletWorldCommand, {
                eventId: creditEventId,
                playerId,
                currencies: reward.currency,
            });
            if (Response.isError(credited)) {
                await undoCod();
                return credited;
            }
        }

        const grant = work.grantItems(reward.items, ItemSource.MAIL);
        const before = state.workingCopy();
        const revisionBefore = state.revision;
        state.adopt(work);
        let payment: MailRow | null = null;
        try {
            await withTransaction(async (tx) => {
                await playerDataGlobalService.save(room, state, undefined, tx);
                const claimed = await mailService.markClaimed({
                    mailId: mail.id,
                    recipientId: playerId,
                    dbOrTx: tx,
                });
                // Người gửi thu hồi đúng lúc này (hoặc thư vừa hết hạn): bỏ cả transaction.
                if (!claimed) throw new MailGoneError();
                payment = await mailService.sendCodPayment({
                    mail,
                    payerName: state.name,
                    dbOrTx: tx,
                });
            });
        } catch (error) {
            state.adopt(before);
            state.revision = revisionBefore;
            await undoCredit();
            await undoCod();
            if (error instanceof MailGoneError) return Response.error(MailErrorCode.MAIL_NOT_FOUND);
            throw error;
        }

        playerDataGlobalService.pushToWorld(room, state);
        if (reward.items.length > 0) playerDataGlobalService.sendInventory(room, state);
        const client = room.clientOf(playerId);
        if (client) inventoryGlobalService.notifyGrant(client, state, grant);
        if (payment) void this.notifyReceived(room, payment);
        return Response.success<MailClaimedMessage>({
            mailId: mail.id,
            items: reward.items.map((item) => this.toItemMessage(item)),
            currency: reward.currency.map((entry) => this.toCurrencyMessage(entry)),
        });
    }
}

export const mailGlobalService = new MailGlobalService();
