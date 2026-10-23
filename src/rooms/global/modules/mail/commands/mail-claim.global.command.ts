import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { MailErrorCode } from "@/modules/mails/enums/mail-error-code.enum.js";
import { mailService } from "@/modules/mails/services/mail.service.js";
import { mailGlobalService } from "@/rooms/global/modules/mail/services/mail.global.service.js";
import { MailIdSchema } from "@/rooms/global/modules/mail/validators/mail.validator.js";
import { playerDataGlobalService } from "@/rooms/global/modules/player-data/services/player-data.global.service.js";
import { GlobalClientMessage, GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    response: "MailClaimedMessage",
    replies: [GlobalMessage.INVENTORY, GlobalMessage.MAIL_RECEIVED],
    errors: [
        CommonCode.INVALID_INPUT,
        MailErrorCode.MAIL_NOT_FOUND,
        MailErrorCode.MAIL_EXPIRED,
        MailErrorCode.MAIL_ALREADY_CLAIMED,
        MailErrorCode.MAIL_NO_ATTACHMENT,
        MailErrorCode.MAIL_NEEDS_WORLD,
        ItemErrorCode.INVENTORY_FULL,
        ItemErrorCode.CURRENCY_NOT_ENOUGH,
    ],
    note: "Item vào túi (túi đầy: `INVENTORY_FULL`, thư giữ nguyên), tiền vào ví (cần đang ở world). Thư COD: trừ giá COD của bạn trước (`CURRENCY_NOT_ENOUGH` nếu thiếu); người gửi nhận lại tiền bằng thư hệ thống (`mailReceived`).",
})
export class MailClaimGlobalCommand extends PlayerGlobalCommand<
    PlayerCommandPayload,
    typeof MailIdSchema
> {
    static readonly message = GlobalClientMessage.MAIL_CLAIM;

    protected override readonly validateSchema = MailIdSchema;

    /** Nhận đính kèm của một thư (việc nhận chung với `mailClaimAll` nằm ở `mailGlobalService.claimOne`). */
    async execute({ client }: PlayerCommandPayload) {
        const { room } = this;
        const recipientId = client.auth.playerId;
        const { mailId } = this.body;
        this.result = await playerDataGlobalService.exclusive(recipientId, async () => {
            const mail = await mailService.findOwned({ mailId, recipientId });
            if (!mail) return Response.error(MailErrorCode.MAIL_NOT_FOUND);
            if (mailService.isExpired(mail)) return Response.error(MailErrorCode.MAIL_EXPIRED);
            if (mail.claimedAt) return Response.error(MailErrorCode.MAIL_ALREADY_CLAIMED);
            if (!mail.reward) return Response.error(MailErrorCode.MAIL_NO_ATTACHMENT);
            const state = await playerDataGlobalService.load(room, recipientId);
            return mailGlobalService.claimOne(room, state, mail);
        });
    }
}
