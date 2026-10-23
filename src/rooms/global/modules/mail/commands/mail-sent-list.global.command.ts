import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { mailService } from "@/modules/mails/services/mail.service.js";
import type { MailSentListMessage } from "@/rooms/global/modules/mail/interfaces/mail.global.message.js";
import { mailGlobalService } from "@/rooms/global/modules/mail/services/mail.global.service.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    response: "MailSentListMessage",
    note: "Chỉ thư người nhận chưa claim (còn thu hồi được bằng `mailRecall`); thư đã nhận không còn liệt kê.",
})
export class MailSentListGlobalCommand extends PlayerGlobalCommand {
    static readonly message = GlobalClientMessage.MAIL_SENT_LIST;

    async execute({ client }: PlayerCommandPayload) {
        const rows = await mailService.listSentUnclaimed(client.auth.playerId);
        const recipients = await PlayerIdentityRepo.findByIds(
            rows.map((row) => row.recipientPlayerId)
        );
        const names = new Map(recipients.map((player) => [player.id, player.name]));
        this.result = Response.success<MailSentListMessage>({
            mails: rows.map((row) => ({
                id: row.id,
                recipientId: row.recipientPlayerId,
                recipientName: names.get(row.recipientPlayerId) ?? "",
                subject: row.subject ?? "",
                ...(row.reward ? { reward: mailGlobalService.toRewardMessage(row.reward) } : {}),
                ...(row.cod ? { cod: mailGlobalService.toCurrencyMessage(row.cod) } : {}),
                read: row.readAt !== null,
                createdAt: row.createdAt.getTime(),
                expiresAt: row.expiresAt.getTime(),
            })),
        });
    }
}
