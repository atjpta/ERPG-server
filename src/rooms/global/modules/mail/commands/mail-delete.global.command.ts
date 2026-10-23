import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import { MailErrorCode } from "@/modules/mails/enums/mail-error-code.enum.js";
import { mailService } from "@/modules/mails/services/mail.service.js";
import { MailIdSchema } from "@/rooms/global/modules/mail/validators/mail.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    errors: [
        CommonCode.INVALID_INPUT,
        MailErrorCode.MAIL_NOT_FOUND,
        MailErrorCode.MAIL_NOT_DELETABLE,
    ],
    note: "Chỉ xoá được thư đã đọc và (không có đính kèm hoặc đã nhận). Thư COD chưa nhận phải nhận hoặc trả lại (`mailReturn`).",
})
export class MailDeleteGlobalCommand extends PlayerGlobalCommand<
    PlayerCommandPayload,
    typeof MailIdSchema
> {
    static readonly message = GlobalClientMessage.MAIL_DELETE;

    protected override readonly validateSchema = MailIdSchema;

    async execute({ client }: PlayerCommandPayload) {
        const recipientId = client.auth.playerId;
        const { mailId } = this.body;
        if (await mailService.deleteDeletable({ mailId, recipientId })) {
            this.result = Response.success();
            return;
        }
        const existing = await mailService.findOwned({ mailId, recipientId });
        this.result = Response.error(
            existing ? MailErrorCode.MAIL_NOT_DELETABLE : MailErrorCode.MAIL_NOT_FOUND
        );
    }
}
