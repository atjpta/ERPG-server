import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { Result } from "@/core/response/result.type.js";
import { Response } from "@/core/response/response.js";
import { PlayerDataGroup } from "@/modules/player/enums/player-state.enum.js";
import type { PlayerSavedState } from "@/modules/player/types/player-fields.type.js";
import { PlayerStateManager } from "@/rooms/global/modules/player-data/managers/player-state.manager.js";
import type { GlobalPlayerApi } from "@/modules/player/types/global-player-api.type.js";
import {
    createPlayers,
    createStates,
    readState,
    removePlayers,
    type TestPlayer,
} from "./fixtures.js";
import { check, checkEqual, test } from "./harness.js";

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const goldOf = (data: PlayerSavedState) => data.wallet.gold?.balance ?? 0;
const gold = (amount: number) => [{ code: "gold", amount }] as never;

interface Setup {
    global: PlayerStateManager;
    replica: PlayerStateManager;
    api: GlobalPlayerApi;
    /** Số lần `write` kế tiếp mà global đã áp nhưng ack bị mất (như timeout). */
    lostAcks: { count: number };
    /** `true` = global không đẩy thay đổi xuống world (mô phỏng đẩy muộn / mất). */
    muteNotifier: { on: boolean };
}

/** Một "process global" (host) và một "process world" (replica) nói chuyện qua JSON, như khi đi qua `rooms/bus`. */
function setup(): Setup {
    const lostAcks = { count: 0 };
    const muteNotifier = { on: false };
    const link: { replica?: PlayerStateManager } = {};
    // Phía global: `PlayerStateManager` không có `upstream`, nhận lời gọi `host*` và đẩy thay đổi xuống world qua notifier.
    const global = new PlayerStateManager(undefined, {
        groupChanged: (_room, message) => {
            if (!muteNotifier.on) link.replica?.receiveGroup(json(message));
        },
        partyChanged: (_room, message) => link.replica?.receiveParty(json(message)),
    });
    const api: GlobalPlayerApi = {
        attach: async (request) => json(await global.hostAttach(json(request))),
        snapshot: async (request) => json(await global.hostSnapshot(json(request))),
        write: async (request) => {
            const result = json(await global.hostWrite(json(request)));
            if (lostAcks.count > 0) {
                lostAcks.count--;
                return Response.error(CommonCode.ROOM_UNAVAILABLE);
            }
            return result;
        },
        sync: async (request) => json(await global.hostSync(json(request))),
        presence: async (request) => json(await global.hostPresence(json(request))),
        detach: async (request) => json(await global.hostDetach(json(request))),
    };
    const replica = new PlayerStateManager(api);
    link.replica = replica;
    return { global, replica, api, lostAcks, muteNotifier };
}

async function withReplica<T>(
    run: (context: Setup & { player: TestPlayer }) => Promise<T>
): Promise<T> {
    const [player] = await createPlayers(1, "rp");
    const context = setup();
    try {
        await createStates([player]);
        return await run({ ...context, player });
    } finally {
        context.global.dropAllWithoutSaving();
        context.replica.dropAllWithoutSaving();
        await removePlayers([player]);
    }
}

/** Đợi hàng đợi gửi lên global của replica chạy hết (các lần `write` là bất đồng bộ). */
const settled = () => sleep(60);

test("replica: attach dựng bản sao từ global, không dùng chung object", () =>
    withReplica(async ({ global, replica, player }) => {
        const playerState = await replica.attach(player.id, "world:w1");
        const original = global.get(player.id);
        check(original, "global holds the player");
        check(playerState !== original, "replica is a separate object");
        checkEqual(playerState.data.mapCode, original.data.mapCode, "same data");
        checkEqual(playerState.name, original.name, "same name");
        check(original.users.has("world:w1"), "global knows the world user");
        await replica.detach(player.id, "world:w1");
        check(!global.get(player.id), "global releases after the last user detached");
    }));

test("replica: credit áp ngay ở world rồi tới global; debit thiếu tiền thì từ chối ngay", () =>
    withReplica(async ({ global, replica, player }) => {
        const playerState = await replica.attach(player.id, "world:w1");
        replica.credit(playerState, gold(50));
        checkEqual(goldOf(playerState.data), 50, "visible at once on the replica");
        await settled();
        checkEqual(goldOf(global.get(player.id)!.data), 50, "global got it");

        check(!replica.debit(playerState, gold(80)), "not enough money is refused locally");
        check(replica.debit(playerState, gold(20)), "enough money is accepted");
        await settled();
        checkEqual(goldOf(playerState.data), 30, "replica balance");
        checkEqual(goldOf(global.get(player.id)!.data), 30, "global balance");
        await replica.detach(player.id, "world:w1");
    }));

test("replica: ack bị mất thì gửi lại cùng eventId, global không áp hai lần", () =>
    withReplica(async ({ global, replica, lostAcks, player }) => {
        const playerState = await replica.attach(player.id, "world:w1");
        lostAcks.count = 1;
        replica.credit(playerState, gold(10));
        await sleep(500);
        checkEqual(goldOf(global.get(player.id)!.data), 10, "applied once, not twice");
        checkEqual(goldOf(playerState.data), 10, "replica agrees");
        await replica.detach(player.id, "world:w1");
    }));

test("replica: global từ chối thì giá trị thật của global đè lên phần đã áp thử", () =>
    withReplica(async ({ global, replica, muteNotifier, player }) => {
        const playerState = await replica.attach(player.id, "world:w1");
        replica.credit(playerState, gold(100));
        await settled();
        // Global bị trừ tiền ở chỗ khác (vd thư COD) mà world chưa biết.
        muteNotifier.on = true;
        await global.transact(player.id, async (draft) => {
            draft.wallet = {
                ...draft.wallet,
                gold: { balance: 5, totalEarned: 100, totalSpent: 95 },
            };
        });
        muteNotifier.on = false;
        checkEqual(goldOf(playerState.data), 100, "replica is stale");
        check(replica.debit(playerState, gold(60)), "replica accepts on its stale data");
        await settled();
        checkEqual(goldOf(global.get(player.id)!.data), 5, "global refused, unchanged");
        checkEqual(goldOf(playerState.data), 5, "replica was corrected");
        await replica.detach(player.id, "world:w1");
    }));

test("replica: thay đổi ở global được đẩy xuống world", () =>
    withReplica(async ({ global, replica, player }) => {
        const playerState = await replica.attach(player.id, "world:w1");
        let notified = 0;
        replica.on("walletChanged" as never, () => notified++);
        await global.transact(player.id, async (draft) => {
            draft.wallet = { ...draft.wallet, gold: { balance: 7, totalEarned: 7, totalSpent: 0 } };
        });
        checkEqual(goldOf(playerState.data), 7, "replica follows global");
        check(notified > 0, "wallet event fired on the world side");
        await replica.detach(player.id, "world:w1");
    }));

test("replica: lô thao tác túi / điểm áp ở cả hai bên", () =>
    withReplica(async ({ global, replica, player }) => {
        const playerState = await replica.attach(player.id, "world:w1");
        const before = playerState.data.attributePoints;
        const failure = replica.applyOps(playerState, [
            { type: "addPoints", attributePoints: 3, skillPoints: 1 },
        ]);
        check(!Response.isError(failure), "accepted");
        checkEqual(playerState.data.attributePoints, before + 3, "replica");
        await settled();
        checkEqual(global.get(player.id)!.data.attributePoints, before + 3, "global");
        const missing = replica.applyOps(playerState, [
            { type: "takeItem", itemCode: "no_such_item", quantity: 1 },
        ]);
        check(Response.isError(missing), "taking a missing item fails locally");
        await replica.detach(player.id, "world:w1");
    }));

test("replica: tiến độ và vị trí được sao lưu lên global và ghi DB khi save / detach", () =>
    withReplica(async ({ replica, player }) => {
        const playerState = await replica.attach(player.id, "world:w1");
        playerState.setCapture("world:w1", () => ({
            mapCode: playerState.data.mapCode,
            x: 9,
            y: 8,
            direction: "left" as never,
            hp: 33,
            mp: 11,
            dungeonSession: null,
        }));
        replica.mutate(playerState, PlayerDataGroup.PROGRESS, (data) => {
            data.exp = 42;
        });
        checkEqual((await readState(player.id)).exp, 0, "nothing in the DB before a flush");
        await replica.save(player.id, [PlayerDataGroup.PROGRESS, PlayerDataGroup.PLACE]);
        const row = await readState(player.id);
        checkEqual(row.exp, 42, "progress saved");
        checkEqual([row.x, row.y, row.hp], [9, 8, 33], "place saved");

        replica.mutate(playerState, PlayerDataGroup.PROGRESS, (data) => {
            data.exp = 77;
        });
        await replica.detach(player.id, "world:w1");
        checkEqual((await readState(player.id)).exp, 77, "final sync on detach");
    }));

test("replica: world cũ (đã đổi map) gửi muộn không đè dữ liệu của world mới", () =>
    withReplica(async ({ global, api, player }) => {
        await api.attach({ playerId: player.id, worldRoomId: "old" });
        await api.attach({ playerId: player.id, worldRoomId: "new" });
        await api.sync({
            playerId: player.id,
            worldRoomId: "new",
            progress: { exp: 50 },
            flush: true,
        });
        await api.sync({
            playerId: player.id,
            worldRoomId: "old",
            progress: { exp: 1 },
            flush: true,
        });
        checkEqual(global.get(player.id)!.data.exp, 50, "stale world ignored");
        check(global.hasRemoteWorld(player.id), "the new world is still registered");
        await api.detach({ playerId: player.id, worldRoomId: "old" });
        check(global.hasRemoteWorld(player.id), "detaching the old world keeps the new one");
        await api.detach({ playerId: player.id, worldRoomId: "new" });
        check(!global.get(player.id), "released after both detached");
    }));

test("replica: các bản sao ở hai world gắn/gỡ lần lượt cùng một player (đổi map)", () =>
    withReplica(async ({ global, replica, player }) => {
        const first = await replica.attach(player.id, "world:a");
        const second = await replica.attach(player.id, "world:b");
        check(first === second, "same replica object within a process");
        await replica.detach(player.id, "world:a");
        check(replica.get(player.id), "still held by the second world");
        check(global.get(player.id), "global still holds it");
        await replica.detach(player.id, "world:b");
        check(!replica.get(player.id), "released");
        check(!global.get(player.id), "global released");
    }));

export type { Result };
