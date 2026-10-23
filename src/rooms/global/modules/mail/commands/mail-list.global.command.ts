import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { mailRenderService } from "@/modules/mails/services/mail-render.service.js";
import { mailService } from "@/modules/mails/services/mail.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import type { MailListMessage } from "@/rooms/global/modules/mail/interfaces/mail.global.message.js";
import { mailGlobalService } from "@/rooms/global/modules/mail/services/mail.global.service.js";
import { MailListSchema } from "@/rooms/global/modules/mail/validators/mail.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    response: "MailListMessage",
    errors: [CommonCode.INVALID_INPUT],
    note: "Gọi lúc vào game và khi mở hộp thư. `locale` (vd `vi`, `en`) quyết định ngôn ngữ thư hệ thống; thiếu ngôn ngữ đó thì server fallback về ngôn ngữ mặc định rồi `en` (response có `locale` thực dùng). Server nhớ locale để push `mailReceived` đúng ngôn ngữ. Lệnh này cũng phát các broadcast còn hạn chưa nhận.",
})
export class MailListGlobalCommand extends PlayerGlobalCommand<
    PlayerCommandPayload,
    typeof MailListSchema
> {
    static readonly message = GlobalClientMessage.MAIL_LIST;

    protected override readonly validateSchema = MailListSchema;

    /** Hộp thư. Phát luôn các broadcast còn hạn chưa nhận (danh sách trả về đã gồm chúng, không cần push riêng). */
    async execute({ client }: PlayerCommandPayload) {
        const { room } = this;
        const playerId = client.auth.playerId;
        if (this.body.locale) room.state.mails.setLocale(playerId, this.body.locale);
        const locale = room.state.mails.localeOf(playerId);

        const identity = await PlayerIdentityRepo.findById({ id: playerId });
        if (identity) {
            await mailService.materializeBroadcasts({
                serverId: room.serverId,
                playerId,
                playerCreatedAt: identity.createdAt,
            });
        }
        const rows = await mailService.listInbox(playerId);
        const rendered = await mailRenderService.renderMany(rows, locale);
        this.result = Response.success<MailListMessage>({
            mails: rows.map((row) => mailGlobalService.toMailMessage(row, rendered.get(row.id)!)),
            unreadCount: rows.filter((row) => row.readAt === null).length,
            locale: locale ?? masterDataCacheService.get(MasterDataKey.MAIL_CONFIG).defaultLocale,
        });
    }
}
