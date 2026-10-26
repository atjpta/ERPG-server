import { DateTime } from "luxon";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import { Response } from "@/core/response/response.js";
import { GiftCodeErrorCode } from "@/modules/gift-codes/enums/gift-code-error-code.enum.js";
import { GiftCodeRedemptionRepo } from "@/modules/gift-codes/repositories/gift-code-redemption.repository.js";
import { GiftCodeRepo } from "@/modules/gift-codes/repositories/gift-code.repository.js";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import type { MailRow } from "@/modules/mails/entities/mail.entity.js";
import { mailService } from "@/modules/mails/services/mail.service.js";
import { rewardSpecService } from "@/modules/rewards/services/reward-spec.service.js";

export class GiftCodeService {
    /** Người chơi gõ thế nào cũng được: bỏ khoảng trắng hai đầu, không phân biệt hoa thường. */
    normalize(code: string): string {
        return code.trim().toUpperCase();
    }

    /**
     * Nhân vật `playerId` nhập `code` ở game server `serverId`. Kiểm điều kiện (bật, server, thời hạn) rồi MỘT transaction
     * { ghi biên nhận (unique: mỗi nhân vật một lần), tăng lượt dùng có điều kiện, tạo thư quà }. Hết lượt thì rollback luôn
     * biên nhận. Trả thư vừa tạo (nơi gọi đẩy `mailReceived` cho người đang online).
     */
    redeem(params: {
        serverId: string;
        playerId: string;
        code: string;
    }): Promise<Response<MailRow>> {
        const { serverId, playerId } = params;
        return Response.attempt(async () => {
            const giftCode = await GiftCodeRepo.findByCode({ code: this.normalize(params.code) });
            if (
                !giftCode ||
                !giftCode.active ||
                (giftCode.serverId && giftCode.serverId !== serverId)
            ) {
                return Response.abort(GiftCodeErrorCode.GIFT_CODE_NOT_FOUND);
            }
            const now = DateTime.now();
            if (giftCode.startsAt && now < DateTime.fromJSDate(giftCode.startsAt)) {
                return Response.abort(GiftCodeErrorCode.GIFT_CODE_NOT_STARTED);
            }
            if (giftCode.expiresAt && now >= DateTime.fromJSDate(giftCode.expiresAt)) {
                return Response.abort(GiftCodeErrorCode.GIFT_CODE_EXPIRED);
            }
            const reward = rewardSpecService.resolveRewardSpec(giftCode.reward, ItemSource.MAIL);
            if (reward.currency.length === 0 && reward.items.length === 0) {
                // code cấu hình sai (item không còn trong catalog...): không gửi thư rỗng
                return Response.abort(CommonCode.INTERNAL_ERROR);
            }

            return withTransaction(async (tx) => {
                const first = await GiftCodeRedemptionRepo.claim({
                    giftCodeId: giftCode.id,
                    playerId,
                    dbOrTx: tx,
                });
                if (!first) return Response.abort(GiftCodeErrorCode.GIFT_CODE_ALREADY_REDEEMED);
                const counted = await GiftCodeRepo.incrementUsedIfAvailable({
                    id: giftCode.id,
                    dbOrTx: tx,
                });
                if (!counted) return Response.abort(GiftCodeErrorCode.GIFT_CODE_EXHAUSTED);

                const mail = await mailService.sendReward({
                    serverId,
                    recipientPlayerId: playerId,
                    templateCode: giftCode.templateCode,
                    params: giftCode.params ?? undefined,
                    reward,
                    dbOrTx: tx,
                });
                await GiftCodeRedemptionRepo.attachMail({
                    giftCodeId: giftCode.id,
                    playerId,
                    mailId: mail.id,
                    dbOrTx: tx,
                });
                return mail;
            });
        });
    }
}

export const giftCodeService = new GiftCodeService();
