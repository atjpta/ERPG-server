import { eq } from "drizzle-orm";
import { db } from "@/configs/postgres.config.js";
import { generateEntityId } from "@/core/entities/base.entity.js";
import { Response } from "@/core/response/response.js";
import { GiftCodes, type GiftCodeRow } from "@/modules/gift-codes/entities/gift-code.entity.js";
import { GiftCodeRedemptions } from "@/modules/gift-codes/entities/gift-code-redemption.entity.js";
import { GiftCodeErrorCode } from "@/modules/gift-codes/enums/gift-code-error-code.enum.js";
import { GiftCodeRepo } from "@/modules/gift-codes/repositories/gift-code.repository.js";
import { giftCodeService } from "@/modules/gift-codes/services/gift-code.service.js";
import { Mails } from "@/modules/mails/entities/mail.entity.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import { createPlayers, removePlayers, type TestPlayer } from "./fixtures.js";
import { check, checkEqual, test } from "./harness.js";

/** Người chơi tạm + một gift code tạm; dọn sạch khi xong (xoá code kéo theo biên nhận, xoá người chơi kéo theo thư). */
async function withCode<T>(
    playerCount: number,
    data: Partial<typeof GiftCodes.$inferInsert>,
    run: (players: TestPlayer[], giftCode: GiftCodeRow) => Promise<T>
): Promise<T> {
    const players = await createPlayers(playerCount, "gc");
    const giftCode = await GiftCodeRepo.create({
        data: {
            id: generateEntityId(),
            code: `TEST${Date.now()}${Math.floor(Math.random() * 100000)}`,
            reward: { exp: 0, currency: [{ code: CurrencyCode.GOLD, amount: 100 }], items: [] },
            ...data,
        },
    });
    try {
        return await run(players, giftCode);
    } finally {
        await db.delete(GiftCodes).where(eq(GiftCodes.id, giftCode.id));
        await removePlayers(players);
    }
}

const redeem = (player: TestPlayer, code: string, serverId = player.serverId) =>
    giftCodeService.redeem({ serverId, playerId: player.id, code });

const errorCode = (response: Response<unknown>) =>
    Response.isError(response) ? response.errorCode : undefined;

const mailsOf = (player: TestPlayer) =>
    db.select().from(Mails).where(eq(Mails.recipientPlayerId, player.id));

const usedCount = async (giftCode: GiftCodeRow) =>
    (await GiftCodeRepo.findByIdOrFail({ id: giftCode.id })).usedCount;

test("giftcode: nhập đúng → một thư quà, không phân biệt hoa thường", async () => {
    await withCode(1, {}, async ([player], giftCode) => {
        const result = await redeem(player, ` ${giftCode.code.toLowerCase()} `);
        check(result.success, `expected success, got ${JSON.stringify(result)}`);
        const mails = await mailsOf(player);
        checkEqual(mails.length, 1, "mail count");
        checkEqual(mails[0].templateCode, "gift_code", "template");
        checkEqual(mails[0].reward?.currency, [{ code: CurrencyCode.GOLD, amount: 100 }], "reward");
        checkEqual(await usedCount(giftCode), 1, "used count");
    });
});

test("giftcode: sai mã / mã bị tắt → GIFT_CODE_NOT_FOUND", async () => {
    await withCode(1, { active: false }, async ([player], giftCode) => {
        checkEqual(
            errorCode(await redeem(player, giftCode.code)),
            GiftCodeErrorCode.GIFT_CODE_NOT_FOUND,
            "disabled"
        );
        checkEqual(
            errorCode(await redeem(player, "KHONGCOMA")),
            GiftCodeErrorCode.GIFT_CODE_NOT_FOUND,
            "unknown"
        );
        checkEqual((await mailsOf(player)).length, 0, "no mail");
    });
});

test("giftcode: sai game server → GIFT_CODE_NOT_FOUND", async () => {
    await withCode(1, {}, async ([player], giftCode) => {
        await db
            .update(GiftCodes)
            .set({ serverId: player.serverId })
            .where(eq(GiftCodes.id, giftCode.id));
        checkEqual(
            errorCode(await redeem(player, giftCode.code, generateEntityId())),
            GiftCodeErrorCode.GIFT_CODE_NOT_FOUND,
            "other server"
        );
        check((await redeem(player, giftCode.code)).success, "same server works");
    });
});

test("giftcode: chưa bắt đầu / hết hạn", async () => {
    const hour = 3_600_000;
    await withCode(1, { startsAt: new Date(Date.now() + hour) }, async ([player], giftCode) => {
        checkEqual(
            errorCode(await redeem(player, giftCode.code)),
            GiftCodeErrorCode.GIFT_CODE_NOT_STARTED,
            "not started"
        );
    });
    await withCode(1, { expiresAt: new Date(Date.now() - hour) }, async ([player], giftCode) => {
        checkEqual(
            errorCode(await redeem(player, giftCode.code)),
            GiftCodeErrorCode.GIFT_CODE_EXPIRED,
            "expired"
        );
    });
});

test("giftcode: cùng nhân vật nhập đồng thời → đúng một thư, một lượt", async () => {
    await withCode(1, {}, async ([player], giftCode) => {
        const results = await Promise.all(
            Array.from({ length: 8 }, () => redeem(player, giftCode.code))
        );
        checkEqual(results.filter((r) => r.success).length, 1, "successes");
        for (const result of results.filter((r) => !r.success)) {
            checkEqual(
                errorCode(result),
                GiftCodeErrorCode.GIFT_CODE_ALREADY_REDEEMED,
                "loser code"
            );
        }
        checkEqual((await mailsOf(player)).length, 1, "mail count");
        checkEqual(await usedCount(giftCode), 1, "used count");
    });
});

test("giftcode: nhập lần hai (và sau khi xoá thư) vẫn bị từ chối", async () => {
    await withCode(1, {}, async ([player], giftCode) => {
        check((await redeem(player, giftCode.code)).success, "first");
        await db.delete(Mails).where(eq(Mails.recipientPlayerId, player.id));
        checkEqual(
            errorCode(await redeem(player, giftCode.code)),
            GiftCodeErrorCode.GIFT_CODE_ALREADY_REDEEMED,
            "second"
        );
        checkEqual((await mailsOf(player)).length, 0, "no new mail");
    });
});

test("giftcode: maxUses = 3, 6 nhân vật đồng thời → đúng 3 thư, người thua không để lại biên nhận", async () => {
    await withCode(6, { maxUses: 3 }, async (players, giftCode) => {
        const results = await Promise.all(players.map((player) => redeem(player, giftCode.code)));
        checkEqual(results.filter((r) => r.success).length, 3, "successes");
        for (const result of results.filter((r) => !r.success)) {
            checkEqual(errorCode(result), GiftCodeErrorCode.GIFT_CODE_EXHAUSTED, "loser code");
        }
        checkEqual(await usedCount(giftCode), 3, "used count");
        const redemptions = await db
            .select()
            .from(GiftCodeRedemptions)
            .where(eq(GiftCodeRedemptions.giftCodeId, giftCode.id));
        checkEqual(redemptions.length, 3, "redemptions rolled back for losers");
    });
});
