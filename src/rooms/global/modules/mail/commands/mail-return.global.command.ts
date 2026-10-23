import { CommonCode } from "@/core/enums/common-code.enum.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import { MailErrorCode } from "@/modules/mails/enums/mail-error-code.enum.js";
import { mailService } from "@/modules/mails/services/mail.service.js";
import { mailGlobalService } from "@/rooms/global/modules/mail/services/mail.global.service.js";
import { MailIdSchema } from "@/rooms/global/modules/mail/validators/mail.validator.js";
import { playerDataGlobalService } from "@/rooms/global/modules/player-data/services/player-data.global.service.js";
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
        this.result = await playerDataGlobalService.exclusive(recipientId, async () => {
            const mail = await mailService.findOwned({ mailId, recipientId });
            if (!mail || mailService.isExpired(mail)) {
                return Response.error(MailErrorCode.MAIL_NOT_FOUND);
            }
            const state = await playerDataGlobalService.load(room, recipientId);
            const outcome = await withTransaction(async (tx) => {
                const deleted = await mailService.deleteReturnable({
                    mailId,
                    recipientId,
                    dbOrTx: tx,
                });
                if (!deleted) return null;
                const returned = await mailService.returnToSender({
                    mail: deleted,
                    recipientName: state.name,
                    dbOrTx: tx,
                });
                return { returned };
            });
            if (!outcome) {
                return Response.error(
                    mail.claimedAt
                        ? MailErrorCode.MAIL_ALREADY_CLAIMED
                        : MailErrorCode.MAIL_NOT_RETURNABLE
                );
            }
            if (outcome.returned) void mailGlobalService.notifyReceived(room, outcome.returned);
            return Response.success();
        });
    }
}
