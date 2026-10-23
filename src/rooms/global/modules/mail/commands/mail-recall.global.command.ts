import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import { MailErrorCode } from "@/modules/mails/enums/mail-error-code.enum.js";
import {
    isMailTransferFailure,
    mailTransferService,
} from "@/modules/mails/services/mail-transfer.service.js";
import type { MailRemovedMessage } from "@/rooms/global/modules/mail/interfaces/mail.global.message.js";
import { mailGlobalService } from "@/rooms/global/modules/mail/services/mail.global.service.js";
import { MailIdSchema } from "@/rooms/global/modules/mail/validators/mail.validator.js";
import { GlobalClientMessage, GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    replies: [GlobalMessage.MAIL_RECEIVED],
    errors: [
        CommonCode.INVALID_INPUT,
        MailErrorCode.MAIL_NOT_FOUND,
        MailErrorCode.MAIL_ALREADY_CLAIMED,
    ],
    note: "Thu hồi thư mình gửi khi người nhận chưa claim (đã đọc vẫn thu hồi được). Người nhận (nếu online) nhận `mailRemoved`; đính kèm về bạn bằng thư hệ thống `mail_returned` (`mailReceived`).",
})
export class MailRecallGlobalCommand extends PlayerGlobalCommand<
    PlayerCommandPayload,
    typeof MailIdSchema
> {
    static readonly message = GlobalClientMessage.MAIL_RECALL;

    protected override readonly validateSchema = MailIdSchema;

    /** Người gửi thu hồi thư chưa được claim (đã đọc vẫn thu hồi được). */
    async execute({ client }: PlayerCommandPayload) {
        const { room } = this;
        const senderId = client.auth.playerId;
        const { mailId } = this.body;
        // Xoá có điều kiện (chưa claim): thắng / thua với `mailClaim` do DB phân xử.
        const outcome = await mailTransferService.recall({ mailId, senderId });
        if (isMailTransferFailure(outcome)) {
            this.result = Response.error(
                outcome.failure === "claimed"
                    ? MailErrorCode.MAIL_ALREADY_CLAIMED
                    : MailErrorCode.MAIL_NOT_FOUND
            );
            return;
        }
        const removed: MailRemovedMessage = { mailId };
        room.clientOf(outcome.deleted.recipientPlayerId)?.sendSuccess(
            GlobalMessage.MAIL_REMOVED,
            removed
        );
        if (outcome.returned) void mailGlobalService.notifyReceived(room, outcome.returned);
        this.result = Response.success();
    }
}
