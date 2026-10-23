import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { mailRenderService } from "@/modules/mails/services/mail-render.service.js";
import { mailService } from "@/modules/mails/services/mail.service.js";
import type { MailListMessage } from "@/rooms/global/modules/mail/interfaces/mail.global.message.js";
import { mailGlobalService } from "@/rooms/global/modules/mail/services/mail.global.service.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    response: "MailListMessage",
    note: "Gọi lúc vào game và khi mở hộp thư. Thư hệ thống mang nội dung ở mọi ngôn ngữ (`texts`), client tự chọn theo ngôn ngữ của nó. Lệnh này cũng phát các broadcast còn hạn chưa nhận.",
})
export class MailListGlobalCommand extends PlayerGlobalCommand {
    static readonly message = GlobalClientMessage.MAIL_LIST;

    /** Hộp thư. Phát luôn các broadcast còn hạn chưa nhận (danh sách trả về đã gồm chúng, không cần push riêng). */
    async execute({ client }: PlayerCommandPayload) {
        const { room } = this;
        const playerId = client.auth.playerId;
        const identity = await PlayerIdentityRepo.findById({ id: playerId });
        if (identity) {
            await mailService.materializeBroadcasts({
                serverId: room.serverId,
                playerId,
                playerCreatedAt: identity.createdAt,
            });
        }
        const rows = await mailService.listInbox(playerId);
        const rendered = await mailRenderService.renderMany(rows);
        this.result = Response.success<MailListMessage>({
            mails: rows.map((row) => mailGlobalService.toMailMessage(row, rendered.get(row.id)!)),
            unreadCount: rows.filter((row) => row.readAt === null).length,
        });
    }
}
