import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { MailErrorCode } from "@/modules/mails/enums/mail-error-code.enum.js";
import { mailService } from "@/modules/mails/services/mail.service.js";
import { mailGlobalService } from "@/rooms/global/modules/mail/services/mail.global.service.js";
import { MailIdSchema } from "@/rooms/global/modules/mail/validators/mail.validator.js";
import { GlobalClientMessage, GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    response: "MailClaimedMessage",
    replies: [GlobalMessage.INVENTORY_CHANGED, GlobalMessage.MAIL_RECEIVED],
    errors: [
        CommonCode.INVALID_INPUT,
        MailErrorCode.MAIL_NOT_FOUND,
        MailErrorCode.MAIL_EXPIRED,
        MailErrorCode.MAIL_ALREADY_CLAIMED,
        MailErrorCode.MAIL_NO_ATTACHMENT,
        ItemErrorCode.INVENTORY_FULL,
        ItemErrorCode.CURRENCY_NOT_ENOUGH,
    ],
    note: "Item vào túi (túi đầy: `INVENTORY_FULL`, thư giữ nguyên), tiền vào ví. Thư COD: trừ giá COD của bạn trước (`CURRENCY_NOT_ENOUGH` nếu thiếu); người gửi nhận lại tiền bằng thư hệ thống (`mailReceived`).",
})
export class MailClaimGlobalCommand extends PlayerGlobalCommand<
    PlayerCommandPayload,
    typeof MailIdSchema
> {
    static readonly message = GlobalClientMessage.MAIL_CLAIM;

    protected override readonly validateSchema = MailIdSchema;

    /** Nhận đính kèm của một thư (việc nhận chung với `mailClaimAll` nằm ở `mailGlobalService.claimOne`). */
    async execute({ client }: PlayerCommandPayload) {
        const recipientId = client.auth.playerId;
        const { mailId } = this.body;
        const mail = await mailService.findOwned({ mailId, recipientId });
        if (!mail) {
            this.result = Response.error(MailErrorCode.MAIL_NOT_FOUND);
        } else if (mailService.isExpired(mail)) {
            this.result = Response.error(MailErrorCode.MAIL_EXPIRED);
        } else if (mail.claimedAt) {
            this.result = Response.error(MailErrorCode.MAIL_ALREADY_CLAIMED);
        } else if (!mail.reward) {
            this.result = Response.error(MailErrorCode.MAIL_NO_ATTACHMENT);
        } else {
            this.result = await mailGlobalService.claimOne(this.room, this.player, mail);
        }
    }
}
