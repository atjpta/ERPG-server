import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    PartyConfigSchema,
    PartyDungeonDenyReason,
    PartyLootMode,
    type PartyMemberInfo,
} from "@/modules/party/schemas/party.schema.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import { PartyError, PartyModel } from "@/modules/party/party.model.js";
import { partyDirectoryService } from "@/modules/party/services/party-directory.service.js";
import { shareKillReward, withinLevelGap } from "@/modules/party/utils/party-loot.util.js";
import { splitPartyExp } from "@/modules/party/utils/party-exp.util.js";
import { checkPartyDungeonEntry, nextLeader } from "@/modules/party/utils/party-rules.util.js";

const member = (id: string, extra: Partial<PartyMemberInfo> = {}): PartyMemberInfo => ({
    playerId: id,
    name: id,
    level: 10,
    hp: 100,
    maxHp: 100,
    mapCode: "greenfield_plains",
    inWorld: true,
    inDungeon: false,
    ...extra,
});

describe("splitPartyExp", () => {
    it("1 người hoặc exp 0: giữ nguyên", () => {
        assert.equal(splitPartyExp(100, 1, 0.1), 100);
        assert.equal(splitPartyExp(0, 3, 0.1), 0);
    });

    it("cộng bonus theo số người thêm rồi chia đều, làm tròn xuống", () => {
        // 2 người: 100 × 1.1 / 2 = 55
        assert.equal(splitPartyExp(100, 2, 0.1), 55);
        // 4 người: 100 × 1.3 / 4 = 32.5 → 32
        assert.equal(splitPartyExp(100, 4, 0.1), 32);
    });

    it("không bonus thì chia đều thuần", () => {
        assert.equal(splitPartyExp(100, 3, 0), 33);
    });

    it("cả party nhận nhiều hơn một mình khi có bonus", () => {
        assert.ok(splitPartyExp(100, 4, 0.1) * 4 > 100);
    });
});

describe("nextLeader", () => {
    it("thành viên vào sớm nhất còn lại; hết người thì undefined", () => {
        assert.equal(nextLeader(["a", "b", "c"], "a"), "b");
        assert.equal(nextLeader(["a", "b", "c"], "b"), "a");
        assert.equal(nextLeader(["a"], "a"), undefined);
    });
});

describe("checkPartyDungeonEntry", () => {
    const options = { minLevel: 10 };

    it("đủ điều kiện: không có lỗi", () => {
        assert.deepEqual(checkPartyDungeonEntry([member("a"), member("b")], options), []);
    });

    it("liệt kê từng người không đạt với lý do đúng", () => {
        const failures = checkPartyDungeonEntry(
            [
                member("a"),
                member("low", { level: 5 }),
                member("dead", { hp: 0 }),
                member("away", { inWorld: false }),
                member("busy", { inDungeon: true }),
            ],
            options
        );
        assert.deepEqual(
            failures.map((f) => [f.playerId, f.reason]),
            [
                ["low", PartyDungeonDenyReason.LEVEL_TOO_LOW],
                ["dead", PartyDungeonDenyReason.DEAD],
                ["away", PartyDungeonDenyReason.OFFLINE],
                ["busy", PartyDungeonDenyReason.IN_DUNGEON],
            ]
        );
    });
});

describe("PartyModel loot mode", () => {
    const config = {
        maxMembers: 3,
        inviteTtlSec: 30,
        expBonusPerExtraMember: 0.1,
        maxLevelGap: 10,
        shareGold: true,
        lootMode: PartyLootMode.ROUND_ROBIN,
    };

    it("mặc định theo config, chỉ chủ đổi được", () => {
        const party = new PartyModel(config, member("a"));
        assert.equal(party.lootMode, PartyLootMode.ROUND_ROBIN);
        assert.equal(party.setLootMode("b", PartyLootMode.KILLER), PartyError.NOT_LEADER);
        assert.equal(party.setLootMode("a", PartyLootMode.KILLER), undefined);
        assert.equal(party.lootMode, PartyLootMode.KILLER);
    });
});

describe("party config", () => {
    it("schema nhận giá trị mặc định và từ chối giá trị sai", () => {
        const value = { maxMembers: 4, inviteTtlSec: 30, expBonusPerExtraMember: 0.1 };
        assert.doesNotThrow(() => PartyConfigSchema.parse(value));
        assert.throws(() => PartyConfigSchema.parse({ ...value, maxMembers: 0 }));
        assert.throws(() => PartyConfigSchema.parse({ ...value, expBonusPerExtraMember: -1 }));
    });
});

describe("party directory (memory cache)", () => {
    it("con trỏ party đặt / đọc / xoá", async () => {
        await partyDirectoryService.setPartyRoomId("p1", "room1");
        assert.equal(await partyDirectoryService.getPartyRoomId("p1"), "room1");
        await partyDirectoryService.clearPartyRoomId("p1");
        assert.equal(await partyDirectoryService.getPartyRoomId("p1"), null);
    });

    it("world room cũ chỉ xoá được khi còn trỏ về nó (đổi map: room mới ghi đè trước)", async () => {
        await partyDirectoryService.setWorldRoomId("p2", "old");
        await partyDirectoryService.setWorldRoomId("p2", "new");
        await partyDirectoryService.clearWorldRoomId("p2", "old");
        assert.equal(await partyDirectoryService.getWorldRoomId("p2"), "new");
        await partyDirectoryService.clearWorldRoomId("p2", "new");
        assert.equal(await partyDirectoryService.getWorldRoomId("p2"), null);
    });

    it("kỳ vọng vào dungeon đọc lại được", async () => {
        await partyDirectoryService.setDungeonExpectation("i1", {
            dungeonCode: "slime_hollow",
            leaderPlayerId: "a",
            expected: ["a", "b"],
        });
        assert.deepEqual((await partyDirectoryService.getDungeonExpectation("i1"))?.expected, [
            "a",
            "b",
        ]);
        assert.equal(await partyDirectoryService.getDungeonExpectation("none"), null);
    });

    it("giới hạn 10 lời mời mỗi phút mỗi người", async () => {
        let allowed = 0;
        for (let i = 0; i < 12; i++) {
            if (await partyDirectoryService.allowInvite("spammer")) allowed++;
        }
        assert.equal(allowed, 10);
    });
});

describe("PartyModel", () => {
    const config = {
        maxMembers: 3,
        inviteTtlSec: 30,
        expBonusPerExtraMember: 0.1,
        maxLevelGap: 10,
        shareGold: true,
        lootMode: PartyLootMode.ROUND_ROBIN,
    };
    const model = () => new PartyModel(config, member("a"));

    it("tạo party với chủ là người đầu tiên", () => {
        const party = model();
        assert.equal(party.leaderId, "a");
        assert.equal(party.size, 1);
        assert.ok(party.isLeader("a"));
    });

    it("chỉ chủ mời; không tự mời, không mời người đã trong party", () => {
        const party = model();
        assert.equal(party.canInvite("b", "c", 0), PartyError.NOT_LEADER);
        assert.equal(party.canInvite("a", "a", 0), PartyError.SELF_TARGET);
        assert.equal(party.canInvite("a", "b", 0), undefined);
        party.addInvite("b", { fromName: "a", snapshot: member("b"), expiresAt: 1000 });
        assert.equal(party.joinWithInvite("b", 10), undefined);
        assert.equal(party.canInvite("a", "b", 10), PartyError.ALREADY_MEMBER);
    });

    it("lời mời giữ chỗ: không mời quá số chỗ kể cả lời mời chưa nhận", () => {
        const party = model();
        party.addInvite("b", { fromName: "a", snapshot: member("b"), expiresAt: 1000 });
        party.addInvite("c", { fromName: "a", snapshot: member("c"), expiresAt: 1000 });
        assert.equal(party.canInvite("a", "d", 10), PartyError.PARTY_FULL);
        // mời lại chính người đã có lời mời thì không tính hai lần
        assert.equal(party.canInvite("a", "c", 10), undefined);
    });

    it("lời mời hết hạn thì không vào được và được dọn ra", () => {
        const party = model();
        party.addInvite("b", { fromName: "a", snapshot: member("b"), expiresAt: 100 });
        assert.equal(party.joinWithInvite("b", 100), "no_invite");
        const expired = party.pruneInvites(100);
        assert.deepEqual(
            expired.map(([id]) => id),
            ["b"]
        );
        assert.equal(party.canInvite("a", "c", 100), undefined);
    });

    it("không có lời mời thì không vào được; đủ người thì từ chối", () => {
        const party = model();
        assert.equal(party.joinWithInvite("x", 0), "no_invite");
        for (const id of ["b", "c"]) {
            party.addInvite(id, { fromName: "a", snapshot: member(id), expiresAt: 1000 });
            assert.equal(party.joinWithInvite(id, 0), undefined);
        }
        party.addInvite("d", { fromName: "a", snapshot: member("d"), expiresAt: 1000 });
        assert.equal(party.joinWithInvite("d", 0), PartyError.PARTY_FULL);
    });

    it("chủ rời: chuyển cho người vào sớm nhất; người cuối rời thì party rỗng", () => {
        const party = model();
        for (const id of ["b", "c"]) {
            party.addInvite(id, { fromName: "a", snapshot: member(id), expiresAt: 1000 });
            party.joinWithInvite(id, 0);
        }
        assert.deepEqual(party.leave("a"), { empty: false, newLeaderId: "b" });
        assert.equal(party.leaderId, "b");
        assert.deepEqual(party.leave("c"), { empty: false });
        assert.deepEqual(party.leave("b"), { empty: true });
    });

    it("kick / promote chỉ chủ làm được và phải nhắm đúng thành viên", () => {
        const party = model();
        party.addInvite("b", { fromName: "a", snapshot: member("b"), expiresAt: 1000 });
        party.joinWithInvite("b", 0);
        assert.equal(party.kick("b", "a"), PartyError.NOT_LEADER);
        assert.equal(party.kick("a", "a"), PartyError.SELF_TARGET);
        assert.equal(party.kick("a", "zzz"), PartyError.NOT_MEMBER);
        assert.equal(party.promote("a", "b"), undefined);
        assert.equal(party.leaderId, "b");
        assert.equal(party.kick("b", "a"), undefined);
        assert.equal(party.size, 1);
    });

    it("cập nhật thông tin thành viên và kiểm dungeon theo trạng thái mới nhất", () => {
        const party = model();
        party.addInvite("b", { fromName: "a", snapshot: member("b"), expiresAt: 1000 });
        party.joinWithInvite("b", 0);
        assert.deepEqual(party.checkDungeon(10), []);
        party.patch("b", { level: 3 });
        assert.deepEqual(
            party.checkDungeon(10).map((f) => [f.playerId, f.reason]),
            [["b", PartyDungeonDenyReason.LEVEL_TOO_LOW]]
        );
        party.patch("b", { inWorld: false });
        assert.equal(party.checkDungeon(10)[0].reason, PartyDungeonDenyReason.OFFLINE);
    });
});

describe("withinLevelGap", () => {
    it("trong khoảng cho phép, 0 là không giới hạn", () => {
        assert.ok(withinLevelGap(15, 10, 10));
        assert.ok(withinLevelGap(5, 15, 10));
        assert.ok(!withinLevelGap(30, 10, 10));
        assert.ok(!withinLevelGap(1, 20, 10));
        assert.ok(withinLevelGap(1, 99, 0));
    });
});

describe("shareKillReward", () => {
    const item = (id: string) => ({ itemId: id, quantity: 1 });
    const reward = () => ({
        exp: 100,
        currency: [{ code: CurrencyCode.GOLD, amount: 10 }],
        items: [item("i1"), item("i2"), item("i3")],
        source: ItemSource.DROP,
    });
    const people = [
        { id: "a", level: 10 },
        { id: "b", level: 10 },
        { id: "c", level: 10 },
    ];
    const options = {
        expBonusPerExtraMember: 0.1,
        maxLevelGap: 10,
        shareGold: true,
        lootMode: PartyLootMode.ROUND_ROBIN,
        cursor: 0,
    };

    it("một mình hoặc chỉ người kết liễu đủ điều kiện: nhận hết, không đổi con trỏ", () => {
        const solo = shareKillReward(reward(), "a", [people[0]], 10, options);
        assert.equal(solo.rewards.get("a")?.exp, 100);
        assert.equal(solo.rewards.get("a")?.items.length, 3);
        assert.equal(solo.nextCursor, 0);
        const far = shareKillReward(
            reward(),
            "a",
            [people[0], { id: "x", level: 60 }],
            10,
            options
        );
        assert.equal(far.rewards.size, 1);
        assert.equal(far.rewards.get("a")?.exp, 100);
    });

    it("exp chia có bonus; vàng chia đều, phần dư về người kết liễu", () => {
        const { rewards } = shareKillReward(reward(), "b", people, 10, options);
        // 100 × (1 + 0.1 × 2) / 3 = 40
        assert.deepEqual(
            [...rewards.values()].map((r) => r.exp),
            [40, 40, 40]
        );
        const gold = (id: string) => rewards.get(id)?.currency[0]?.amount ?? 0;
        // 10 / 3 = 3 dư 1 → người kết liễu (b) nhận 4
        assert.deepEqual([gold("a"), gold("b"), gold("c")], [3, 4, 3]);
    });

    it("tắt chia vàng: người kết liễu giữ hết", () => {
        const { rewards } = shareKillReward(reward(), "a", people, 10, {
            ...options,
            shareGold: false,
        });
        assert.equal(rewards.get("a")?.currency[0].amount, 10);
        assert.equal(rewards.get("b")?.currency.length, 0);
    });

    it("luân phiên: mỗi item một người, con trỏ tiếp tục ở lần sau", () => {
        const first = shareKillReward(reward(), "a", people, 10, options);
        const owners = (r: typeof first) =>
            [...r.rewards].map(([id, rw]) => [id, rw.items.map((i) => i.itemId)]);
        assert.deepEqual(owners(first), [
            ["a", ["i1"]],
            ["b", ["i2"]],
            ["c", ["i3"]],
        ]);
        assert.equal(first.nextCursor, 3);
        const second = shareKillReward({ ...reward(), items: [item("i4")] }, "a", people, 10, {
            ...options,
            cursor: first.nextCursor,
        });
        assert.deepEqual(owners(second), [
            ["a", ["i4"]],
            ["b", []],
            ["c", []],
        ]);
    });

    it("killer: người kết liễu giữ item; random: người nhận nằm trong nhóm đủ điều kiện", () => {
        const killer = shareKillReward(reward(), "b", people, 10, {
            ...options,
            lootMode: PartyLootMode.KILLER,
        });
        assert.equal(killer.rewards.get("b")?.items.length, 3);
        const random = shareKillReward(reward(), "a", people, 10, {
            ...options,
            lootMode: PartyLootMode.RANDOM,
            rng: () => 0.99,
        });
        assert.equal(random.rewards.get("c")?.items.length, 3);
    });

    it("thành viên chênh level quá lớn không được chia, người còn lại chia nhau", () => {
        const mixed = [...people.slice(0, 2), { id: "boost", level: 50 }];
        const { rewards } = shareKillReward(reward(), "a", mixed, 10, options);
        assert.deepEqual([...rewards.keys()], ["a", "b"]);
        // 100 × 1.1 / 2 = 55
        assert.equal(rewards.get("a")?.exp, 55);
        // maxLevelGap = 0 thì không giới hạn
        const all = shareKillReward(reward(), "a", mixed, 10, { ...options, maxLevelGap: 0 });
        assert.equal(all.rewards.size, 3);
    });
});
