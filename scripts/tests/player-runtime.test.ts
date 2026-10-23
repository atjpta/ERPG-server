import { roomRuntimes } from "@/rooms/runtime/runtime.room.js";
import { eq } from "drizzle-orm";
import { db } from "@/configs/postgres.config.js";
import { PlayerStates } from "@/modules/player/entities/player-state.entity.js";
import { PlayerDataGroup } from "@/rooms/runtime/modules/player/enums/player-runtime.enum.js";
import { TransactAbort } from "@/rooms/runtime/modules/player/services/player-runtime.service.js";
import type { PlayerSavedState } from "@/modules/player/types/player-fields.type.js";
import {
    createPlayers,
    createStates,
    readState,
    removePlayers,
    type TestPlayer,
} from "./fixtures.js";
import { check, checkEqual, test } from "./harness.js";

async function withPlayer<T>(run: (player: TestPlayer) => Promise<T>): Promise<T> {
    const [player] = await createPlayers(1, "rt");
    try {
        await createStates([player]);
        return await run(player);
    } finally {
        runtimes.dropAllWithoutSaving();
        await removePlayers([player]);
    }
}

const runtimes = roomRuntimes.of("test").players;
const setGold = (data: PlayerSavedState, amount: number) => {
    data.wallet = {
        ...data.wallet,
        gold: { balance: amount, totalEarned: amount, totalSpent: 0 },
    };
};
const goldOf = (data: PlayerSavedState) => data.wallet.gold?.balance ?? 0;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("runtime: nhiều bên dùng chung một object, bên cuối detach mới giải phóng", () =>
    withPlayer(async (player) => {
        const a = await runtimes.attach(player.id, "global:s1");
        const b = await runtimes.attach(player.id, "world:r1");
        check(a === b, "same object");
        await runtimes.detach(player.id, "global:s1");
        check(runtimes.get(player.id) === a, "still online while world holds it");
        await runtimes.detach(player.id, "world:r1");
        check(!runtimes.get(player.id), "released after last detach");
        await runtimes.detach(player.id, "world:r1"); // gỡ lại là no-op
    }));

test("runtime: transact lưu ngay; ném lỗi thì rollback", () =>
    withPlayer(async (player) => {
        const runtime = await runtimes.attach(player.id, "global:s1");
        await runtimes.transact(player.id, async (draft) => setGold(draft, 70));
        checkEqual(goldOf(await readState(player.id)), 70, "db balance");
        checkEqual(runtime.dirty.size, 0, "clean");
        const before = (await readState(player.id)).revision;
        let failed = false;
        await runtimes
            .transact(player.id, async (draft) => {
                setGold(draft, 5);
                throw new Error("boom");
            })
            .catch(() => (failed = true));
        check(failed, "error propagated");
        checkEqual(goldOf(runtime.data), 70, "runtime unchanged");
        checkEqual((await readState(player.id)).revision, before, "db unchanged");
    }));

test("runtime: transact đồng thời chạy tuần tự, không mất cập nhật", () =>
    withPlayer(async (player) => {
        const runtime = await runtimes.attach(player.id, "global:s1");
        await Promise.all(
            Array.from({ length: 10 }, () =>
                runtimes.transact(player.id, async (draft) => setGold(draft, goldOf(draft) + 1))
            )
        );
        checkEqual(goldOf(runtime.data), 10, "memory");
        checkEqual(goldOf(await readState(player.id)), 10, "db");
    }));

test("runtime: mutate chỉ ghi nhóm dirty ở autosave", () =>
    withPlayer(async (player) => {
        const runtime = await runtimes.attach(player.id, "world:r1");
        runtimes.mutate(runtime, PlayerDataGroup.PROGRESS, (data) => {
            data.exp = 42;
        });
        checkEqual((await readState(player.id)).exp, 0, "not saved before autosave");
        // ghi ngoài nhóm place và không đổi revision: nếu autosave ghi lại nhóm place thì hp sẽ bị đè về 100
        await db.update(PlayerStates).set({ hp: 77 }).where(eq(PlayerStates.playerId, player.id));
        await runtimes.autosaveOnce();
        const row = await readState(player.id);
        checkEqual(row.exp, 42, "exp saved");
        checkEqual(row.hp, 77, "place group not rewritten");
        checkEqual(runtime.dirty.size, 0, "clean");
    }));

test("runtime: mutate critical được lưu trong chưa đầy 1 giây", () =>
    withPlayer(async (player) => {
        const runtime = await runtimes.attach(player.id, "world:r1");
        runtimes.mutate(runtime, PlayerDataGroup.WALLET, (data) => setGold(data, 9), {
            critical: true,
        });
        await sleep(900);
        checkEqual(goldOf(await readState(player.id)), 9, "saved by timer");
    }));

test("runtime: mutate trong lúc transact đang chạy không bị mất", () =>
    withPlayer(async (player) => {
        const runtime = await runtimes.attach(player.id, "global:s1");
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        const pending = runtimes.transact(player.id, async (draft) => {
            setGold(draft, 100);
            await gate;
        });
        await sleep(20);
        runtimes.mutate(runtime, PlayerDataGroup.PROGRESS, (data) => {
            data.exp = 5;
        });
        release();
        await pending;
        checkEqual(runtime.data.exp, 5, "exp kept");
        checkEqual(goldOf(runtime.data), 100, "gold kept");
        checkEqual((await readState(player.id)).exp, 5, "exp written with the same update");
    }));

test("runtime: ghi DB từ ngoài được gộp theo nhóm, runtime thắng nhóm dirty", () =>
    withPlayer(async (player) => {
        const runtime = await runtimes.attach(player.id, "global:s1");
        runtimes.mutate(runtime, PlayerDataGroup.PROGRESS, (data) => {
            data.exp = 11;
        });
        await db
            .update(PlayerStates)
            .set({ attributePoints: 7, exp: 999, revision: 50 })
            .where(eq(PlayerStates.playerId, player.id));
        await runtimes.flush(player.id);
        const row = await readState(player.id);
        checkEqual(row.exp, 11, "runtime wins dirty group");
        checkEqual(row.attributePoints, 7, "outside change kept for clean group");
        checkEqual(runtime.data.attributePoints, 7, "memory took DB value");
    }));

test("runtime: crash giữ bản đã lưu, thay đổi chưa lưu mất, không nhân đôi", () =>
    withPlayer(async (player) => {
        const runtime = await runtimes.attach(player.id, "global:s1");
        await runtimes.transact(player.id, async (draft) => setGold(draft, 30));
        runtimes.mutate(runtime, PlayerDataGroup.PROGRESS, (data) => {
            data.exp = 8;
        });
        runtimes.dropAllWithoutSaving(); // process chết
        const reloaded = await runtimes.attach(player.id, "global:s2");
        checkEqual(goldOf(reloaded.data), 30, "saved gold survives");
        checkEqual(reloaded.data.exp, 0, "unsaved non-critical lost");
    }));

test("runtime: flushAll lưu mọi thay đổi chưa lưu", () =>
    withPlayer(async (player) => {
        const runtime = await runtimes.attach(player.id, "world:r1");
        runtimes.mutate(runtime, PlayerDataGroup.PROGRESS, (data) => {
            data.exp = 13;
        });
        await runtimes.flushAll();
        checkEqual((await readState(player.id)).exp, 13, "saved on shutdown");
    }));

test("runtime: capturePlace của world được lưu ở autosave và ở detach cuối", () =>
    withPlayer(async (player) => {
        const runtime = await runtimes.attach(player.id, "world:r1");
        const base = runtime.data;
        let x = 5;
        runtime.capturePlace = () => ({
            mapCode: base.mapCode,
            x,
            y: 6,
            direction: base.direction,
            hp: 33,
            mp: 44,
            dungeonSession: null,
        });
        await runtimes.autosaveOnce();
        checkEqual((await readState(player.id)).x, 5, "autosave position");
        x = 9;
        await runtimes.detach(player.id, "world:r1");
        checkEqual((await readState(player.id)).x, 9, "final save position");
    }));

test("runtime: mutate ví trong lúc transact ví đang chạy được phát lại, không mất", () =>
    withPlayer(async (player) => {
        const runtime = await runtimes.attach(player.id, "global:s1");
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        const pending = runtimes.transact(player.id, async (draft) => {
            setGold(draft, 100);
            await gate;
        });
        await sleep(20);
        runtimes.mutate(runtime, PlayerDataGroup.WALLET, (data) => setGold(data, goldOf(data) + 7));
        release();
        await pending;
        checkEqual(goldOf(runtime.data), 107, "gold from both");
        await runtimes.flush(player.id);
        checkEqual(goldOf(await readState(player.id)), 107, "db");
    }));

test("runtime: TransactAbort rollback và trả giá trị", () =>
    withPlayer(async (player) => {
        const runtime = await runtimes.attach(player.id, "global:s1");
        const value = await runtimes.transact(player.id, async (draft) => {
            setGold(draft, 50);
            throw new TransactAbort("nope");
        });
        checkEqual(value, "nope", "aborted value");
        checkEqual(goldOf(runtime.data), 0, "unchanged");
    }));

test("runtime: sửa tại chỗ nhóm progress được phát hiện ở autosave", () =>
    withPlayer(async (player) => {
        const runtime = await runtimes.attach(player.id, "world:r1");
        runtime.data.flags = { met_npc: true };
        await runtimes.autosaveOnce();
        checkEqual((await readState(player.id)).flags, { met_npc: true }, "flags saved");
    }));

test("runtime: nhân vật bị xoá khi đang online thì detach không ném lỗi", () =>
    withPlayer(async (player) => {
        const runtime = await runtimes.attach(player.id, "world:r1");
        runtimes.mutate(runtime, PlayerDataGroup.WALLET, (data) => setGold(data, 5));
        await db.delete(PlayerStates).where(eq(PlayerStates.playerId, player.id));
        await runtimes.detach(player.id, "world:r1");
        check(!runtimes.get(player.id), "released");
    }));

test("runtime: autosave lệch nhau giữa các player và chỉ lưu người tới lượt", async () => {
    const players = await createPlayers(6, "rtj");
    try {
        await createStates(players);
        const runtimeList = [];
        for (const player of players)
            runtimeList.push(await runtimes.attach(player.id, `t:${player.id}`));
        const interval = 30_000;
        const now = Date.now();
        for (const runtime of runtimeList) {
            check(runtime.nextAutosaveAt >= now - 1000, "not in the past");
            check(runtime.nextAutosaveAt <= now + interval + 1000, "within one interval");
        }
        check(
            new Set(runtimeList.map((r) => Math.floor(r.nextAutosaveAt / 100))).size > 1,
            "spread out"
        );

        const [first] = runtimeList;
        runtimes.mutate(first, PlayerDataGroup.PROGRESS, (data) => {
            data.exp = 21;
        });
        first.nextAutosaveAt = now + 10 * interval;
        await runtimes.autosaveDue(now);
        checkEqual((await readState(players[0].id)).exp, 0, "not due yet: nothing written");
        await runtimes.autosaveDue(now + 11 * interval);
        checkEqual((await readState(players[0].id)).exp, 21, "due: written");
        check(first.nextAutosaveAt > now + 11 * interval, "rescheduled after saving");
    } finally {
        runtimes.dropAllWithoutSaving();
        await removePlayers(players);
    }
});

test("runtime: mỗi game server một runtime riêng trong cùng process", () =>
    withPlayer(async (player) => {
        const serverA = roomRuntimes.of("server-a");
        const serverB = roomRuntimes.of("server-b");
        check(serverA !== serverB, "separate instances");
        check(roomRuntimes.of("server-a") === serverA, "same instance for the same server");

        const attached = await serverA.players.attach(player.id, "global:a");
        check(serverA.players.get(player.id) === attached, "visible in its own server");
        check(!serverB.players.get(player.id), "not visible in another server");
        check(attached.owner === serverA.players, "runtime knows its owner");

        const party = serverA.parties.create({ playerId: player.id, name: "x" });
        check(serverA.parties.getPartyByPlayerId(player.id) === party, "party in its own server");
        check(!serverB.parties.getPartyByPlayerId(player.id), "party isolated");
        await serverA.players.flushAll();
        serverA.players.dropAllWithoutSaving();
    }));
