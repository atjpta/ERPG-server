import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import { MailErrorCode } from "@/modules/mails/enums/mail-error-code.enum.js";
import { mailService } from "@/modules/mails/services/mail.service.js";
import type { MailReadMessage } from "@/rooms/global/modules/mail/interfaces/mail.global.message.js";
import { MailIdSchema } from "@/rooms/global/modules/mail/validators/mail.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    response: "MailReadMessage",
    errors: [CommonCode.INVALID_INPUT, MailErrorCode.MAIL_NOT_FOUND],
    note: "Đánh dấu đã đọc (gọi lại không sao). Thư chưa đọc không xoá được.",
})
export class MailReadGlobalCommand extends PlayerGlobalCommand<
    PlayerCommandPayload,
    typeof MailIdSchema
> {
    static readonly message = GlobalClientMessage.MAIL_READ;

    protected override readonly validateSchema = MailIdSchema;

    async execute({ client }: PlayerCommandPayload) {
        const recipientId = client.auth.playerId;
        const { mailId } = this.body;
        const mail = await mailService.findOwned({ mailId, recipientId });
        if (!mail || mailService.isExpired(mail)) {
            this.result = Response.error(MailErrorCode.MAIL_NOT_FOUND);
            return;
        }
        await mailService.markRead({ mailId, recipientId });
        this.result = Response.success<MailReadMessage>({
            unreadCount: await mailService.countUnread(recipientId),
        });
    }
}
