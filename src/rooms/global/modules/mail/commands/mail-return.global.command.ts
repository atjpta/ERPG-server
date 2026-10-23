import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import { MailErrorCode } from "@/modules/mails/enums/mail-error-code.enum.js";
import { mailService } from "@/modules/mails/services/mail.service.js";
import {
    isMailTransferFailure,
    mailTransferService,
} from "@/modules/mails/services/mail-transfer.service.js";
import { mailGlobalService } from "@/rooms/global/modules/mail/services/mail.global.service.js";
import { MailIdSchema } from "@/rooms/global/modules/mail/validators/mail.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    errors: [
        CommonCode.INVALID_INPUT,
        MailErrorCode.MAIL_NOT_FOUND,
        MailErrorCode.MAIL_NOT_RETURNABLE,
        MailErrorCode.MAIL_ALREADY_CLAIMED,
    ],
    note: "Từ chối / trả lại thư người chơi chưa nhận (chủ yếu thư COD). Thư bị xoá; người gửi (nếu còn) nhận lại đính kèm bằng thư hệ thống `mail_returned`. Thư hệ thống không trả lại được.",
})
export class MailReturnGlobalCommand extends PlayerGlobalCommand<
    PlayerCommandPayload,
    typeof MailIdSchema
> {
    static readonly message = GlobalClientMessage.MAIL_RETURN;

    protected override readonly validateSchema = MailIdSchema;

    /** Người nhận trả lại thư người chơi chưa nhận: thư xoá, đính kèm về người gửi bằng thư `mail_returned`. */
    async execute({ client }: PlayerCommandPayload) {
        const { room } = this;
        const recipientId = client.auth.playerId;
        const { mailId } = this.body;
        const mail = await mailService.findOwned({ mailId, recipientId });
        if (!mail || mailService.isExpired(mail)) {
            this.result = Response.error(MailErrorCode.MAIL_NOT_FOUND);
            return;
        }
        const outcome = await mailTransferService.returnMail({
            mailId,
            recipientId,
            recipientName: this.player.name,
        });
        if (isMailTransferFailure(outcome)) {
            const codes = {
                claimed: MailErrorCode.MAIL_ALREADY_CLAIMED,
                not_returnable: MailErrorCode.MAIL_NOT_RETURNABLE,
                not_found: MailErrorCode.MAIL_NOT_FOUND,
            } as const;
            this.result = Response.error(codes[outcome.failure]);
            return;
        }
        if (outcome.returned) void mailGlobalService.notifyReceived(room, outcome.returned);
        this.result = Response.success();
    }
}
