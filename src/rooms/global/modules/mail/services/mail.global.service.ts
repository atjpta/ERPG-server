import { equipmentMessageService } from "@/modules/equipment/services/equipment-message.service.js";
import { Response } from "@/core/response/response.js";
import { RoomResponse } from "@/core/response/room-response.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import type { MailRow } from "@/modules/mails/entities/mail.entity.js";
import { MailErrorCode } from "@/modules/mails/enums/mail-error-code.enum.js";
import { mailRenderService } from "@/modules/mails/services/mail-render.service.js";
import type { MailTextVariant } from "@/modules/mails/types/mail-render.type.js";
import { mailTransferService } from "@/modules/mails/services/mail-transfer.service.js";
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
import type { PlayerState } from "@/modules/player/state/player.state.js";
import { TransactAbort } from "@/rooms/global/modules/player-data/managers/player-state.manager.js";
import type { GrantOutcome } from "@/modules/player/types/inventory.type.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";

/**
 * Phần dùng chung của các command mail trong global room: dựng DTO, push thư mới và nhận một thư (`claimOne`, dùng cho cả
 * `mailClaim` lẫn `mailClaimAll`). Logic chỉ một command dùng nằm ngay trong command đó; luật nghiệp vụ nằm ở
 * `modules/mails` (`MailTransferService`).
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
            ...(metadata ? { metadata: equipmentMessageService.toInstanceMessage(metadata) } : {}),
        };
    }

    toRewardMessage(reward: MailReward): MailRewardMessage {
        return {
            items: reward.items.map((item) => this.toItemMessage(item)),
            currency: reward.currency.map((entry) => this.toCurrencyMessage(entry)),
        };
    }

    toMailMessage(row: MailRow, texts: MailTextVariant[]): MailMessage {
        return {
            id: row.id,
            kind: row.kind,
            ...(row.senderPlayerId ? { senderId: row.senderPlayerId } : {}),
            ...(row.senderName ? { senderName: row.senderName } : {}),
            subject: row.subject ?? "",
            body: row.body ?? "",
            texts: texts.map(({ locale, subject, body }) => ({ locale, subject, body })),
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
        const rendered = (await mailRenderService.renderMany([row])).get(row.id)!;
        const data: MailReceivedMessage = {
            mail: this.toMailMessage(row, rendered),
            unreadCount: await mailService.countUnread(row.recipientPlayerId),
        };
        RoomResponse.send(client, GlobalMessage.MAIL_RECEIVED, data);
    }

    // ------------------------------------------------------------------ nhận

    /**
     * Nhận một thư: MỘT transaction { cộng đính kèm vào túi / ví người nhận, trừ giá COD nếu có, đánh dấu đã nhận có điều kiện, thư
     * thanh toán COD cho người gửi }. Thiếu chỗ / thiếu tiền / thư vừa bị thu hồi thì rollback cả, thư giữ nguyên.
     */
    async claimOne(
        room: GlobalRoom,
        playerState: PlayerState,
        mail: MailRow
    ): Promise<Response<MailClaimedMessage>> {
        const reward = mail.reward!;
        let payment: MailRow | null = null;
        let grant: GrantOutcome | undefined;
        const result = await playerState.owner.transact(
            playerState.playerId,
            async (draft, tx): Promise<Response<MailClaimedMessage>> => {
                const work = playerState.fork(draft);
                if (!work.canFit(reward.items)) {
                    throw new TransactAbort(Response.error(ItemErrorCode.INVENTORY_FULL));
                }
                if (mail.cod) {
                    if (!work.debitWallet([mail.cod])) {
                        throw new TransactAbort(Response.error(ItemErrorCode.CURRENCY_NOT_ENOUGH));
                    }
                }
                if (reward.currency.length > 0) {
                    work.creditWallet(reward.currency);
                }
                grant = work.bag.grant(reward.items, ItemSource.MAIL);
                const claimed = await mailTransferService.claimInTransaction({
                    mail,
                    recipientId: playerState.playerId,
                    payerName: playerState.name,
                    tx,
                });
                // Thư bị thu hồi / hết hạn đúng lúc này: huỷ cả giao dịch (kể cả giá COD vừa trừ).
                if (!claimed) throw new TransactAbort(Response.error(MailErrorCode.MAIL_NOT_FOUND));
                payment = claimed.payment;
                return Response.success<MailClaimedMessage>({
                    mailId: mail.id,
                    items: reward.items.map((item) => this.toItemMessage(item)),
                    currency: reward.currency.map((entry) => this.toCurrencyMessage(entry)),
                });
            }
        );
        if (Response.isError(result)) return result;
        const client = room.clientOf(playerState.playerId);
        if (client && grant) inventoryGlobalService.notifyGrant(client, playerState, grant);
        if (payment) void this.notifyReceived(room, payment);
        return result;
    }
}

export const mailGlobalService = new MailGlobalService();
