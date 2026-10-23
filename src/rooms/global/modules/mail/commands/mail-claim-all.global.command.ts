import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { MailErrorCode } from "@/modules/mails/enums/mail-error-code.enum.js";
import { mailService } from "@/modules/mails/services/mail.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import type { MailClaimAllMessage } from "@/rooms/global/modules/mail/interfaces/mail.global.message.js";
import { mailGlobalService } from "@/rooms/global/modules/mail/services/mail.global.service.js";
import { playerDataGlobalService } from "@/rooms/global/modules/player-data/services/player-data.global.service.js";
import { GlobalClientMessage, GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    response: "MailClaimAllMessage",
    replies: [GlobalMessage.INVENTORY],
    note: "Nhận tất cả thư có đính kèm không COD (tối đa `mail_config.claimAllLimit`). Dừng giữa chừng khi túi đầy hoặc cần world: `stoppedBy` là mã lỗi (`INVENTORY_FULL`, `MAIL_NEEDS_WORLD`) và các thư đã nhận trước đó vẫn có trong `claimed`. Thư COD bị bỏ qua (`skippedCod`).",
})
export class MailClaimAllGlobalCommand extends PlayerGlobalCommand {
    static readonly message = GlobalClientMessage.MAIL_CLAIM_ALL;

    /** Nhận đính kèm mọi thư không COD (dừng khi túi đầy hoặc cần world). */
    async execute({ client }: PlayerCommandPayload) {
        const { room } = this;
        const recipientId = client.auth.playerId;
        const { claimAllLimit } = masterDataCacheService.get(MasterDataKey.MAIL_CONFIG);
        this.result = await playerDataGlobalService.exclusive(recipientId, async () => {
            const state = await playerDataGlobalService.load(room, recipientId);
            const rows = (await mailService.listInbox(recipientId)).filter(
                (row) => row.reward && !row.claimedAt
            );
            const result: MailClaimAllMessage = { claimed: [], skippedCod: 0 };
            for (const mail of rows) {
                if (mail.cod) {
                    result.skippedCod++;
                    continue;
                }
                if (result.claimed.length >= claimAllLimit) break;
                const claimed = await mailGlobalService.claimOne(room, state, mail);
                if (!Response.isError(claimed)) {
                    result.claimed.push(claimed.data);
                    continue;
                }
                const stop =
                    claimed.code === ItemErrorCode.INVENTORY_FULL ||
                    claimed.code === MailErrorCode.MAIL_NEEDS_WORLD;
                if (stop) {
                    result.stoppedBy = claimed.code;
                    break;
                }
            }
            return Response.success<MailClaimAllMessage>(result);
        });
    }
}
