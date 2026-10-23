import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import { mailService } from "@/modules/mails/services/mail.service.js";
import type { MailDeletedMessage } from "@/rooms/global/modules/mail/interfaces/mail.global.message.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    response: "MailDeletedMessage",
    note: "Xoá mọi thư xoá được (đã đọc và không còn đính kèm chưa nhận); trả id đã xoá.",
})
export class MailDeleteReadGlobalCommand extends PlayerGlobalCommand {
    static readonly message = GlobalClientMessage.MAIL_DELETE_READ;

    async execute({ client }: PlayerCommandPayload) {
        const deleted = await mailService.deleteAllDeletable({
            recipientId: client.auth.playerId,
        });
        this.result = Response.success<MailDeletedMessage>({
            mailIds: deleted.map((row) => row.id),
        });
    }
}
