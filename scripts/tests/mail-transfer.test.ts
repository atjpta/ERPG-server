import { PlayerStateManager } from "@/rooms/global/modules/player-data/managers/player-state.manager.js";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/configs/postgres.config.js";
import { generateEntityId } from "@/core/entities/base.entity.js";
import { Response } from "@/core/response/response.js";
import { Friendships } from "@/modules/friends/entities/friendship.entity.js";
import { FriendshipStatus } from "@/modules/friends/enums/friendship-status.enum.js";
import { friendshipService } from "@/modules/friends/services/friendship.service.js";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import { Mails, type MailRow } from "@/modules/mails/entities/mail.entity.js";
import { MailRepo } from "@/modules/mails/repositories/mail.repository.js";
import { mailTransferService } from "@/modules/mails/services/mail-transfer.service.js";
import { mailService } from "@/modules/mails/services/mail.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import { TransactAbort } from "@/rooms/global/modules/player-data/managers/player-state.manager.js";
import { WalletState } from "@/modules/player/state/wallet.state.js";
import type { PlayerSavedState } from "@/modules/player/types/player-fields.type.js";
import type { CurrencyReward } from "@/modules/rewards/types/reward.type.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import { mailGlobalService } from "@/rooms/global/modules/mail/services/mail.global.service.js";
import {
    createPlayers,
    createStates,
    patchMasterData,
    readState,
    removePlayers,
    type TestPlayer,
} from "./fixtures.js";
import { check, checkEqual, test } from "./harness.js";

const states = new PlayerStateManager();
const GOLD = CurrencyCode.GOLD;
const gold = (amount: number): CurrencyReward[] => [{ code: GOLD, amount }];

/** `claimOne` chỉ cần `clientOf` (không có client nào kết nối trong test). */
const fakeRoom = { clientOf: (): undefined => undefined } as unknown as GlobalRoom;

const goldOf = (data: PlayerSavedState) => data.wallet[GOLD]?.balance ?? 0;
const goldInDb = async (player: TestPlayer) => goldOf(await readState(player.id));

/** Người chơi tạm có `player_states` và đang online trong runtime; dọn sạch khi xong. */
async function withPlayers<T>(
    count: number,
    run: (players: TestPlayer[]) => Promise<T>
): Promise<T> {
    const players = await createPlayers(count, "mt");
    try {
        await createStates(players);
        for (const player of players) await states.attach(player.id, `test:${player.id}`);
        return await run(players);
    } finally {
        states.dropAllWithoutSaving();
        await removePlayers(players);
    }
}

const fund = (player: TestPlayer, amount: number) =>
    states.transact(player.id, async (draft) => {
        new WalletState(draft.wallet).credit(gold(amount));
    });

/** Gửi thư đúng như `MailSendGlobalCommand` làm: trừ tiền + tạo thư trong MỘT transaction. */
async function send(params: {
    sender: TestPlayer;
    recipient: TestPlayer;
    currencies?: CurrencyReward[];
    cod?: CurrencyReward | null;
}): Promise<{ mail?: MailRow; error?: unknown }> {
    const { sender, recipient, currencies = [], cod = null } = params;
    let mail: MailRow | undefined;
    const result = await states.transact(sender.id, async (draft, tx): Promise<Response> => {
        if (currencies.length > 0) {
            if (!new WalletState(draft.wallet).debit(currencies)) {
                throw new TransactAbort(Response.error("CURRENCY_NOT_ENOUGH"));
            }
        }
        const created = await mailService.createPlayerMail({
            id: generateEntityId(),
            serverId: sender.serverId,
            sender: { id: sender.id, name: sender.name },
            recipientId: recipient.id,
            subject: "t",
            body: "",
            reward: currencies.length
                ? { currency: currencies, items: [], source: ItemSource.MAIL, exp: 0 }
                : null,
            cod,
            dbOrTx: tx,
        });
        if (Response.isError(created)) throw new TransactAbort(created);
        mail = created.data;
        return Response.success();
    });
    return Response.isError(result) ? { error: result.errorCode } : { mail };
}

const claim = (recipient: TestPlayer, mail: MailRow) =>
    mailGlobalService.claimOne(fakeRoom, states.get(recipient.id)!, mail);

const reload = async (mailId: string) => (await MailRepo.findById({ id: mailId })) ?? undefined;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = () => sleep(Math.random() * 10);

test("sending gold moves it into the mail exactly once", () =>
    withPlayers(2, async ([sender, recipient]) => {
        await fund(sender, 100);
        const { mail, error } = await send({ sender, recipient, currencies: gold(30) });
        check(mail, `mail created (${String(error)})`);
        checkEqual(goldOf(states.get(sender.id)!.data), 70, "memory debited");
        checkEqual(await goldInDb(sender), 70, "db debited in the same transaction");
        checkEqual((await reload(mail.id))?.reward?.currency[0].amount, 30, "mail carries it");
    }));

test("not enough money: nothing is created and nothing is taken", () =>
    withPlayers(2, async ([sender, recipient]) => {
        await fund(sender, 5);
        const { mail, error } = await send({ sender, recipient, currencies: gold(30) });
        checkEqual(error, "CURRENCY_NOT_ENOUGH", "rejected");
        check(!mail, "no mail");
        checkEqual(await goldInDb(sender), 5, "money untouched");
        checkEqual(await mailService.countPlayerInbox(recipient.id), 0, "inbox empty");
    }));

test("inbox full rolls the debit back with the mail", () =>
    withPlayers(2, async ([sender, recipient]) => {
        patchMasterData(MasterDataKey.MAIL_CONFIG, { maxInbox: 1 });
        try {
            await fund(sender, 100);
            check((await send({ sender, recipient, currencies: gold(10) })).mail, "first fits");
            const second = await send({ sender, recipient, currencies: gold(10) });
            checkEqual(second.error, "MAIL_TARGET_INBOX_FULL", "second rejected");
            checkEqual(goldOf(states.get(sender.id)!.data), 90, "memory: only the first debit");
            checkEqual(await goldInDb(sender), 90, "db: only the first debit");
        } finally {
            patchMasterData(MasterDataKey.MAIL_CONFIG, { maxInbox: 100 });
        }
    }));

test("concurrent sends cannot overflow the inbox and never lose or duplicate money", () =>
    withPlayers(9, async ([recipient, ...senders]) => {
        patchMasterData(MasterDataKey.MAIL_CONFIG, { maxInbox: 3 });
        try {
            for (const sender of senders) await fund(sender, 100);
            const results = await Promise.all(
                senders.map((sender) => send({ sender, recipient, currencies: gold(10) }))
            );
            checkEqual(results.filter((result) => result.mail).length, 3, "exactly maxInbox");
            checkEqual(await mailService.countPlayerInbox(recipient.id), 3, "inbox holds 3");
            let inWallets = 0;
            for (const sender of senders) inWallets += await goldInDb(sender);
            checkEqual(inWallets + 30, 800, "money is conserved (wallets + mails)");
        } finally {
            patchMasterData(MasterDataKey.MAIL_CONFIG, { maxInbox: 100 });
        }
    }));

test("claiming credits the recipient once; a second claim changes nothing", () =>
    withPlayers(2, async ([sender, recipient]) => {
        await fund(sender, 50);
        const { mail } = await send({ sender, recipient, currencies: gold(50) });
        check(mail, "sent");
        const first = await claim(recipient, mail);
        check(!Response.isError(first), "claimed");
        const second = await claim(recipient, mail);
        check(Response.isError(second), "second claim rejected");
        checkEqual(await goldInDb(recipient), 50, "credited exactly once");
        check((await reload(mail.id))?.claimedAt, "marked claimed");
    }));

test("a recall racing a claim: exactly one wins and the money follows the winner", async () => {
    for (let round = 0; round < 8; round++) {
        await withPlayers(2, async ([sender, recipient]) => {
            await fund(sender, 40);
            const { mail } = await send({ sender, recipient, currencies: gold(40) });
            check(mail, "sent");
            const [claimed, recalled] = await Promise.all([
                jitter().then(() => claim(recipient, mail)),
                jitter().then(() =>
                    mailTransferService.recall({ mailId: mail.id, senderId: sender.id })
                ),
            ]);
            const claimWon = !Response.isError(claimed);
            const recallWon = !Response.isError(recalled);
            check(
                claimWon !== recallWon,
                `exactly one wins (claim=${claimWon} recall=${recallWon})`
            );
            checkEqual(await goldInDb(recipient), claimWon ? 40 : 0, "recipient money");
            const returned = await db
                .select()
                .from(Mails)
                .where(eq(Mails.recipientPlayerId, sender.id));
            checkEqual(returned.length, recallWon ? 1 : 0, "return mail only when recalled");
        });
    }
});

test("COD: the buyer pays, gets the goods, and the seller is paid by mail", () =>
    withPlayers(2, async ([seller, buyer]) => {
        await fund(seller, 20);
        await fund(buyer, 100);
        const { mail } = await send({
            sender: seller,
            recipient: buyer,
            currencies: gold(20),
            cod: gold(60)[0],
        });
        check(mail, "sent");
        const claimed = await claim(buyer, mail);
        check(!Response.isError(claimed), "claimed");
        checkEqual(await goldInDb(buyer), 100 - 60 + 20, "buyer paid the price and got the goods");
        const payments = await db
            .select()
            .from(Mails)
            .where(eq(Mails.recipientPlayerId, seller.id));
        checkEqual(payments.length, 1, "seller got one payment mail");
        checkEqual(payments[0].reward?.currency[0].amount, 60, "payment is the COD price");
    }));

test("COD without enough money: rejected, the mail stays, and a later retry works", () =>
    withPlayers(2, async ([seller, buyer]) => {
        await fund(seller, 10);
        await fund(buyer, 5);
        const { mail } = await send({
            sender: seller,
            recipient: buyer,
            currencies: gold(10),
            cod: gold(60)[0],
        });
        check(mail, "sent");
        const poor = await claim(buyer, mail);
        check(Response.isError(poor), "rejected");
        check(!(await reload(mail.id))?.claimedAt, "mail not claimed");
        checkEqual(await goldInDb(buyer), 5, "buyer untouched");

        await fund(buyer, 100);
        check(!Response.isError(await claim(buyer, mail)), "retry works");
        checkEqual(await goldInDb(buyer), 105 - 60 + 10, "paid once");
    }));

test("COD where the mail was recalled first: the claim fails and the buyer pays nothing", () =>
    withPlayers(2, async ([seller, buyer]) => {
        await fund(seller, 10);
        await fund(buyer, 100);
        const { mail } = await send({
            sender: seller,
            recipient: buyer,
            currencies: gold(10),
            cod: gold(60)[0],
        });
        check(mail, "sent");
        const recalled = await mailTransferService.recall({ mailId: mail.id, senderId: seller.id });
        check(!Response.isError(recalled), "recalled");
        check(Response.isError(await claim(buyer, mail)), "claim rejected");
        checkEqual(await goldInDb(buyer), 100, "buyer untouched");
        checkEqual(goldOf(states.get(buyer.id)!.data), 100, "memory untouched");
    }));

test("expired mails are swept in batches until the backlog is gone", () =>
    withPlayers(2, async ([sender, recipient]) => {
        const mailIds: string[] = [];
        for (let i = 0; i < 7; i++) {
            const created = await mailService.createPlayerMail({
                id: generateEntityId(),
                serverId: sender.serverId,
                sender: { id: sender.id, name: sender.name },
                recipientId: recipient.id,
                subject: "t",
                body: "",
                reward: {
                    currency: [],
                    items: [{ itemId: generateEntityId(), quantity: 1 }],
                    source: ItemSource.MAIL,
                    exp: 0,
                },
                cod: null,
            });
            if (Response.isError(created)) throw new Error(created.errorCode);
            mailIds.push(created.data.id);
        }
        await db
            .update(Mails)
            .set({ expiresAt: new Date(Date.now() - 1000) })
            .where(inArray(Mails.id, mailIds));

        // Mỗi lần gọi bị giới hạn (2 lô x 2 thư): backlog lớn hơn thì lần sau (hoặc sau restart) làm tiếp.
        const first = await mailTransferService.sweepExpired({
            serverId: sender.serverId,
            batchSize: 2,
            maxBatches: 2,
        });
        checkEqual(first.swept >= 4, true, "the first run is bounded but makes progress");
        const rest = await mailTransferService.sweepExpired({
            serverId: sender.serverId,
            batchSize: 2,
            maxBatches: 10,
        });
        const left = await db.select().from(Mails).where(inArray(Mails.id, mailIds));
        checkEqual(left.length, 0, "no expired mail is left");
        checkEqual(first.swept + rest.swept >= 7, true, "all seven were swept");
        const returned = await db
            .select()
            .from(Mails)
            .where(eq(Mails.recipientPlayerId, sender.id));
        checkEqual(returned.length, 7, "every attachment went back to the sender");
    }));

test("expired friend requests are purged in batches", () =>
    withPlayers(7, async ([target, ...requesters]) => {
        for (const requester of requesters) {
            await db.insert(Friendships).values({
                requesterId: requester.id,
                addresseeId: target.id,
                status: FriendshipStatus.PENDING,
                createdAt: new Date(Date.now() - 400 * 24 * 3600 * 1000),
            });
        }
        let total = 0;
        for (let batch = 0; batch < 10; batch++) {
            const deleted = await friendshipService.purgeExpiredRequests(2);
            total += deleted;
            if (deleted < 2) break;
        }
        check(total >= 6, `purged ${total} of 6`);
        const left = await db
            .select()
            .from(Friendships)
            .where(eq(Friendships.addresseeId, target.id));
        checkEqual(left.length, 0, "nothing left");
    }));
