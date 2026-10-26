import { cacheService } from "@/core/cache/cache.service.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import { GiftCodeErrorCode } from "@/modules/gift-codes/enums/gift-code-error-code.enum.js";
import { giftCodeService } from "@/modules/gift-codes/services/gift-code.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import type { GiftCodeRedeemedMessage } from "@/rooms/global/modules/gift-code/interfaces/gift-code.global.message.js";
import { GiftCodeRedeemSchema } from "@/rooms/global/modules/gift-code/validators/gift-code.validator.js";
import { mailGlobalService } from "@/rooms/global/modules/mail/services/mail.global.service.js";
import { GlobalClientMessage, GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    response: "GiftCodeRedeemedMessage",
    replies: [GlobalMessage.MAIL_RECEIVED],
    errors: [
        CommonCode.INVALID_INPUT,
        CommonCode.TOO_MANY_REQUESTS,
        GiftCodeErrorCode.GIFT_CODE_NOT_FOUND,
        GiftCodeErrorCode.GIFT_CODE_NOT_STARTED,
        GiftCodeErrorCode.GIFT_CODE_EXPIRED,
        GiftCodeErrorCode.GIFT_CODE_ALREADY_REDEEMED,
        GiftCodeErrorCode.GIFT_CODE_EXHAUSTED,
    ],
    note: "Thành công: quà nằm trong thư hệ thống (`mailReceived`), người chơi nhận bằng `mailClaim`. Quá nhiều lần thử: `TOO_MANY_REQUESTS` kèm `error.retryAfterSeconds`.",
})
export class GiftCodeRedeemGlobalCommand extends PlayerGlobalCommand<
    PlayerCommandPayload,
    typeof GiftCodeRedeemSchema
> {
    static readonly message = GlobalClientMessage.GIFT_CODE_REDEEM;

    protected override readonly validateSchema = GiftCodeRedeemSchema;

    async execute({ client }: PlayerCommandPayload) {
        const { room } = this;
        const playerId = client.auth.playerId;

        // Chống dò mã: tính cả lần sai (cache dùng chung nhiều process).
        const { limit, windowSeconds } = masterDataCacheService.get(
            MasterDataKey.GIFT_CODE_CONFIG
        ).redeemRateLimit;
        const attempts = await cacheService.incr(
            `gift-code:redeem-rate:${playerId}`,
            windowSeconds
        );
        if (attempts > limit) {
            this.result = Response.error(CommonCode.TOO_MANY_REQUESTS, {
                retryAfterSeconds: windowSeconds,
            });
            return;
        }

        const outcome = await giftCodeService.redeem({
            serverId: room.serverId,
            playerId,
            code: this.body.code,
        });
        if (Response.isError(outcome)) {
            this.result = outcome;
            return;
        }

        void mailGlobalService.notifyReceived(room, outcome.data);
        this.result = Response.success<GiftCodeRedeemedMessage>({ mailId: outcome.data.id });
    }
}
