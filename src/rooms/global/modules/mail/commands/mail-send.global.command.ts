import { cacheService } from "@/core/cache/cache.service.js";
import { generateEntityId } from "@/core/entities/base.entity.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { callRoom } from "@/core/rooms/room.integration.js";
import type { Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { playerBlockService } from "@/modules/friends/services/player-block.service.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import type { MailRow } from "@/modules/mails/entities/mail.entity.js";
import { MailErrorCode } from "@/modules/mails/enums/mail-error-code.enum.js";
import {
    isAttachmentFailure,
    mailAttachmentService,
} from "@/modules/mails/services/mail-attachment.service.js";
import { mailService } from "@/modules/mails/services/mail.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import type { MailReward } from "@/modules/rewards/schemas/mail-reward.schema.js";
import type { MailSendResultMessage } from "@/rooms/global/modules/mail/interfaces/mail.global.message.js";
import { mailGlobalService } from "@/rooms/global/modules/mail/services/mail.global.service.js";
import { MailSendSchema } from "@/rooms/global/modules/mail/validators/mail.validator.js";
import { playerDataGlobalService } from "@/rooms/global/modules/player-data/services/player-data.global.service.js";
import { GlobalClientMessage, GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";
import {
    CreditWalletWorldCommand,
    DebitWalletWorldCommand,
} from "@/rooms/world/modules/players/commands/wallet.world.command.js";

@SdkMessage({
    response: "MailSendResultMessage",
    replies: [GlobalMessage.INVENTORY],
    errors: [
        CommonCode.INVALID_INPUT,
        CommonCode.TOO_MANY_REQUESTS,
        MailErrorCode.MAIL_TARGET_NOT_FOUND,
        MailErrorCode.MAIL_SELF_TARGET,
        MailErrorCode.MAIL_TARGET_INBOX_FULL,
        MailErrorCode.MAIL_EMPTY,
        MailErrorCode.MAIL_SUBJECT_TOO_LONG,
        MailErrorCode.MAIL_BODY_TOO_LONG,
        MailErrorCode.MAIL_TOO_MANY_ITEMS,
        MailErrorCode.MAIL_ATTACHMENT_DUPLICATE,
        MailErrorCode.MAIL_NEEDS_WORLD,
        MailErrorCode.MAIL_COD_NO_ATTACHMENT,
        MailErrorCode.MAIL_COD_TOO_HIGH,
        ItemErrorCode.ITEM_NOT_FOUND,
        ItemErrorCode.ITEM_NOT_ENOUGH,
        ItemErrorCode.ITEM_LOCKED,
        ItemErrorCode.CURRENCY_NOT_ENOUGH,
    ],
    note: "Gửi cho người chơi cùng server theo tên (offline vẫn nhận; người đã chặn bạn → `MAIL_TARGET_NOT_FOUND`). Item đính kèm rút khỏi túi (`instanceId` lấy từ `inventory`; món khoá không đính kèm được), vàng / gem trừ ở ví (cần đang ở world). `cod` = giá người nhận phải trả mới lấy được đính kèm; không có phí gửi. Người nhận online nhận `mailReceived`. Lỗi có thể kèm `error.maxLength` / `error.max`.",
})
export class MailSendGlobalCommand extends PlayerGlobalCommand<
    PlayerCommandPayload,
    typeof MailSendSchema
> {
    static readonly message = GlobalClientMessage.MAIL_SEND;

    protected override readonly validateSchema = MailSendSchema;

    /**
     * Gửi thư người chơi. Kiểm tra → rút item khỏi túi (bản làm việc) → trừ tiền đính kèm ở world → một transaction lưu
     * `player_states` + ghi thư; lỗi thì hoàn tiền và trả lại túi.
     */
    async execute({ client }: PlayerCommandPayload) {
        const { room, body } = this;
        const senderId = client.auth.playerId;
        const config = masterDataCacheService.get(MasterDataKey.MAIL_CONFIG);

        const subject = body.subject.trim();
        const text = body.body.trim();
        if (subject.length > config.subjectMaxLength) {
            this.result = Response.error(MailErrorCode.MAIL_SUBJECT_TOO_LONG, undefined, {
                maxLength: config.subjectMaxLength,
            });
            return;
        }
        if (text.length > config.bodyMaxLength) {
            this.result = Response.error(MailErrorCode.MAIL_BODY_TOO_LONG, undefined, {
                maxLength: config.bodyMaxLength,
            });
            return;
        }
        if (body.items.length > config.maxAttachmentItems) {
            this.result = Response.error(MailErrorCode.MAIL_TOO_MANY_ITEMS, undefined, {
                max: config.maxAttachmentItems,
            });
            return;
        }
        if (new Set(body.currency.map((entry) => entry.code)).size !== body.currency.length) {
            this.result = Response.error(MailErrorCode.MAIL_ATTACHMENT_DUPLICATE);
            return;
        }
        const hasAttachment = body.items.length > 0 || body.currency.length > 0;
        if (!subject && !text && !hasAttachment) {
            this.result = Response.error(MailErrorCode.MAIL_EMPTY);
            return;
        }
        if (body.cod) {
            if (!hasAttachment) {
                this.result = Response.error(MailErrorCode.MAIL_COD_NO_ATTACHMENT);
                return;
            }
            if (body.cod.amount > config.maxCodAmount) {
                this.result = Response.error(MailErrorCode.MAIL_COD_TOO_HIGH, undefined, {
                    max: config.maxCodAmount,
                });
                return;
            }
        }

        const { limit, windowSeconds } = config.sendRateLimit;
        if ((await cacheService.incr(`mail:send-rate:${senderId}`, windowSeconds)) > limit) {
            this.result = Response.error(CommonCode.TOO_MANY_REQUESTS, undefined, {
                retryAfterSeconds: windowSeconds,
            });
            return;
        }

        const target = await PlayerIdentityRepo.findByServerAndName({
            serverId: room.serverId,
            name: body.targetName,
        });
        if (!target || (await playerBlockService.isBlockedEitherWay(senderId, target.id))) {
            this.result = Response.error(MailErrorCode.MAIL_TARGET_NOT_FOUND);
            return;
        }
        if (target.id === senderId) {
            this.result = Response.error(MailErrorCode.MAIL_SELF_TARGET);
            return;
        }
        if ((await mailService.countPlayerInbox(target.id)) >= config.maxInbox) {
            this.result = Response.error(MailErrorCode.MAIL_TARGET_INBOX_FULL);
            return;
        }

        this.result = await playerDataGlobalService.exclusive(
            senderId,
            async (): Promise<Result<MailSendResultMessage>> => {
                const state = await playerDataGlobalService.load(room, senderId);
                const work = state.workingCopy();
                const taken = mailAttachmentService.take(work.inventories, body.items);
                if (isAttachmentFailure(taken)) return Response.error(taken.code);

                const reward: MailReward | null = hasAttachment
                    ? {
                          currency: body.currency,
                          items: taken.items,
                          source: ItemSource.MAIL,
                          exp: 0,
                      }
                    : null;

                // Tiền đính kèm: trừ ở world trước (ví do world làm chủ).
                const worldRoomId = state.worldRoomId;
                const walletEventId = `mail-send:${generateEntityId()}`;
                if (body.currency.length > 0) {
                    if (!worldRoomId) return Response.error(MailErrorCode.MAIL_NEEDS_WORLD);
                    const debited = await callRoom(worldRoomId, DebitWalletWorldCommand, {
                        eventId: walletEventId,
                        playerId: senderId,
                        currencies: body.currency,
                    });
                    if (Response.isError(debited)) return debited;
                }

                const before = state.workingCopy();
                const revisionBefore = state.revision;
                state.adopt(work);
                let mail: MailRow;
                try {
                    mail = await withTransaction(async (tx) => {
                        await playerDataGlobalService.save(room, state, undefined, tx);
                        return mailService.createPlayerMail({
                            serverId: room.serverId,
                            sender: { id: senderId, name: state.name },
                            recipientId: target.id,
                            subject,
                            body: text,
                            reward,
                            cod: body.cod ?? null,
                            dbOrTx: tx,
                        });
                    });
                } catch (error) {
                    state.adopt(before);
                    state.revision = revisionBefore;
                    if (body.currency.length > 0 && worldRoomId) {
                        await callRoom(worldRoomId, CreditWalletWorldCommand, {
                            eventId: `${walletEventId}:undo`,
                            playerId: senderId,
                            currencies: body.currency,
                        });
                    }
                    throw error;
                }

                playerDataGlobalService.pushToWorld(room, state);
                if (taken.items.length > 0) playerDataGlobalService.sendInventory(room, state);
                void mailGlobalService.notifyReceived(room, mail);
                return Response.success<MailSendResultMessage>({
                    mailId: mail.id,
                    recipientName: target.name,
                });
            }
        );
    }
}
