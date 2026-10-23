import { and, eq, or } from "drizzle-orm";
import { db } from "@/configs/postgres.config.js";
import { Friendships } from "@/modules/friends/entities/friendship.entity.js";
import { PlayerBlocks } from "@/modules/friends/entities/player-block.entity.js";
import { FriendshipStatus } from "@/modules/friends/enums/friendship-status.enum.js";
import { FriendshipRepo } from "@/modules/friends/repositories/friendship.repository.js";
import { PlayerBlockRepo } from "@/modules/friends/repositories/player-block.repository.js";
import {
    friendshipService,
    isFriendFailure,
} from "@/modules/friends/services/friendship.service.js";
import { playerBlockService } from "@/modules/friends/services/player-block.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { check, test } from "./harness.js";
import { createPlayers, patchMasterData, removePlayers, type TestPlayer } from "./fixtures.js";

/** Chạy một thao tác và gom kết quả: thành công, thất bại có mã, hay ném lỗi (cũng là thất bại, nhưng không được báo thành công). */
async function attempt<T>(run: () => Promise<T>): Promise<{ ok: boolean; value?: T }> {
    try {
        const value = await run();
        return { ok: !isFriendFailure(value), value };
    } catch {
        return { ok: false };
    }
}

/** Trễ ngẫu nhiên vài ms để quét nhiều thứ tự xen kẽ giữa hai thao tác đồng thời. */
const jitter = () => new Promise((resolve) => setTimeout(resolve, Math.random() * 12));

const isOk = (value: unknown) => value === null || (value !== undefined && !isFriendFailure(value));

async function withPlayers<T>(
    count: number,
    tag: string,
    run: (players: TestPlayer[]) => Promise<T>
) {
    const players = await createPlayers(count, tag);
    try {
        return await run(players);
    } finally {
        await removePlayers(players);
    }
}

const friendRows = (player: TestPlayer) =>
    db
        .select()
        .from(Friendships)
        .where(
            and(
                or(eq(Friendships.requesterId, player.id), eq(Friendships.addresseeId, player.id)),
                eq(Friendships.status, FriendshipStatus.ACCEPTED)
            )
        );

test("accept vs decline: exactly one succeeds and the DB agrees", async () => {
    for (let round = 0; round < 60; round++) {
        await withPlayers(2, "ad", async ([a, b]) => {
            check(
                !isFriendFailure(await friendshipService.sendRequest({ fromId: a.id, toId: b.id })),
                "request"
            );
            const [accept, decline] = await Promise.all([
                attempt(() => friendshipService.accept({ playerId: b.id, fromId: a.id })),
                attempt(async () => {
                    await jitter();
                    return friendshipService.decline({ playerId: b.id, fromId: a.id });
                }),
            ]);
            const accepted = accept.ok;
            const declined = decline.ok && isOk(decline.value);
            const row = await FriendshipRepo.findBetween({ a: a.id, b: b.id });
            check(
                accepted !== declined,
                `round ${round}: both or neither succeeded (accept=${accepted}, decline=${declined})`
            );
            if (accepted)
                check(
                    row?.status === FriendshipStatus.ACCEPTED,
                    `round ${round}: accept reported but the friendship is gone`
                );
            if (declined) check(!row, `round ${round}: decline reported but a row remains`);
        });
    }
});

test("accept vs cancel: exactly one succeeds and the DB agrees", async () => {
    for (let round = 0; round < 60; round++) {
        await withPlayers(2, "ac", async ([a, b]) => {
            check(
                !isFriendFailure(await friendshipService.sendRequest({ fromId: a.id, toId: b.id })),
                "request"
            );
            const [accept, cancel] = await Promise.all([
                attempt(() => friendshipService.accept({ playerId: b.id, fromId: a.id })),
                attempt(async () => {
                    await jitter();
                    return friendshipService.cancel({ playerId: a.id, toId: b.id });
                }),
            ]);
            const accepted = accept.ok;
            const cancelled = cancel.ok && isOk(cancel.value);
            const row = await FriendshipRepo.findBetween({ a: a.id, b: b.id });
            check(
                accepted !== cancelled,
                `round ${round}: both or neither succeeded (accept=${accepted}, cancel=${cancelled})`
            );
            if (accepted)
                check(
                    row?.status === FriendshipStatus.ACCEPTED,
                    `round ${round}: accept reported but the friendship is gone`
                );
            if (cancelled) check(!row, `round ${round}: cancel reported but a row remains`);
        });
    }
});

test("concurrent accepts cannot exceed maxFriends", async () => {
    patchMasterData(MasterDataKey.FRIEND_CONFIG, { maxFriends: 2 });
    try {
        await withPlayers(5, "mf", async ([host, f0, u1, u2, u3]) => {
            check(
                !isFriendFailure(
                    await friendshipService.sendRequest({ fromId: f0.id, toId: host.id })
                ),
                "f0 request"
            );
            check(
                !isFriendFailure(
                    await friendshipService.accept({ playerId: host.id, fromId: f0.id })
                ),
                "f0 accept"
            );
            for (const user of [u1, u2, u3]) {
                check(
                    !isFriendFailure(
                        await friendshipService.sendRequest({ fromId: user.id, toId: host.id })
                    ),
                    "request"
                );
            }
            await Promise.all(
                [u1, u2, u3].map((user) =>
                    attempt(() => friendshipService.accept({ playerId: host.id, fromId: user.id }))
                )
            );
            const friends = await friendRows(host);
            check(friends.length <= 2, `host has ${friends.length} friends, limit is 2`);
        });
    } finally {
        patchMasterData(MasterDataKey.FRIEND_CONFIG, { maxFriends: 100 });
    }
});

test("concurrent requests cannot exceed maxPendingReceived", async () => {
    patchMasterData(MasterDataKey.FRIEND_CONFIG, { maxPendingReceived: 2 });
    try {
        await withPlayers(7, "pr", async ([target, ...senders]) => {
            await Promise.all(
                senders.map((sender) =>
                    attempt(() =>
                        friendshipService.sendRequest({ fromId: sender.id, toId: target.id })
                    )
                )
            );
            const pending = await db
                .select()
                .from(Friendships)
                .where(
                    and(
                        eq(Friendships.addresseeId, target.id),
                        eq(Friendships.status, FriendshipStatus.PENDING)
                    )
                );
            check(pending.length <= 2, `target has ${pending.length} pending requests, limit is 2`);
        });
    } finally {
        patchMasterData(MasterDataKey.FRIEND_CONFIG, { maxPendingReceived: 50 });
    }
});

test("concurrent requests cannot exceed maxPendingSent", async () => {
    patchMasterData(MasterDataKey.FRIEND_CONFIG, { maxPendingSent: 2 });
    try {
        await withPlayers(7, "ps", async ([sender, ...targets]) => {
            await Promise.all(
                targets.map((target) =>
                    attempt(() =>
                        friendshipService.sendRequest({ fromId: sender.id, toId: target.id })
                    )
                )
            );
            const sent = await db
                .select()
                .from(Friendships)
                .where(
                    and(
                        eq(Friendships.requesterId, sender.id),
                        eq(Friendships.status, FriendshipStatus.PENDING)
                    )
                );
            check(sent.length <= 2, `sender has ${sent.length} pending requests, limit is 2`);
        });
    } finally {
        patchMasterData(MasterDataKey.FRIEND_CONFIG, { maxPendingSent: 30 });
    }
});

test("concurrent blocks cannot exceed maxBlocked", async () => {
    patchMasterData(MasterDataKey.FRIEND_CONFIG, { maxBlocked: 2 });
    try {
        await withPlayers(7, "mb", async ([blocker, ...targets]) => {
            await Promise.all(
                targets.map((target) =>
                    attempt(() =>
                        playerBlockService.block({ blockerId: blocker.id, blockedId: target.id })
                    )
                )
            );
            const blocks = await PlayerBlockRepo.countByBlocker({ blockerId: blocker.id });
            check(blocks <= 2, `blocker has ${blocks} blocks, limit is 2`);
        });
    } finally {
        patchMasterData(MasterDataKey.FRIEND_CONFIG, { maxBlocked: 50 });
    }
});

/** Bất biến: giữa hai người có block (chiều nào cũng vậy) thì không được còn dòng bạn bè / lời mời. */
async function assertNoTieUnderBlock(a: TestPlayer, b: TestPlayer, label: string) {
    const blocked =
        (await PlayerBlockRepo.findPair({ blockerId: a.id, blockedId: b.id })) ||
        (await PlayerBlockRepo.findPair({ blockerId: b.id, blockedId: a.id }));
    const row = await FriendshipRepo.findBetween({ a: a.id, b: b.id });
    check(
        !(blocked && row),
        `${label}: a block exists but a ${row?.status} friendship row remains`
    );
}

test("a request racing a block never leaves a relation behind the block", async () => {
    for (let round = 0; round < 40; round++) {
        await withPlayers(2, "rb", async ([a, b]) => {
            // b chặn a trong lúc a gửi lời mời cho b
            await Promise.all([
                attempt(() => friendshipService.sendRequest({ fromId: a.id, toId: b.id })),
                attempt(() => playerBlockService.block({ blockerId: b.id, blockedId: a.id })),
            ]);
            await assertNoTieUnderBlock(a, b, `round ${round} (target blocks requester)`);
        });
    }
    for (let round = 0; round < 40; round++) {
        await withPlayers(2, "rc", async ([a, b]) => {
            // a chặn b trong lúc b gửi lời mời cho a
            await Promise.all([
                attempt(() => friendshipService.sendRequest({ fromId: b.id, toId: a.id })),
                attempt(() => playerBlockService.block({ blockerId: a.id, blockedId: b.id })),
            ]);
            await assertNoTieUnderBlock(a, b, `round ${round} (requester blocked by target)`);
        });
    }
});

test("an accept racing a block never leaves a friendship behind the block", async () => {
    for (let round = 0; round < 40; round++) {
        await withPlayers(2, "ab", async ([a, b]) => {
            check(
                !isFriendFailure(await friendshipService.sendRequest({ fromId: a.id, toId: b.id })),
                "request"
            );
            await Promise.all([
                attempt(() => friendshipService.accept({ playerId: b.id, fromId: a.id })),
                attempt(() => playerBlockService.block({ blockerId: a.id, blockedId: b.id })),
            ]);
            await assertNoTieUnderBlock(a, b, `round ${round}`);
        });
    }
});

export const friendBlocksTable = PlayerBlocks;
