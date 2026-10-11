import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    PartyConfigSchema,
    PartyDungeonDenyReason,
    type PartyMemberInfo,
} from "@/modules/party/schemas/party.schema.js";
import { partyDirectoryService } from "@/modules/party/services/party-directory.service.js";
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
    const options = { minLevel: 10, capacity: 4, leaderId: "a" };

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
            { ...options, capacity: 5 }
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

    it("party quá sức chứa dungeon: báo cho chủ", () => {
        const members = ["a", "b", "c"].map((id) => member(id));
        const failures = checkPartyDungeonEntry(members, { ...options, capacity: 2 });
        assert.deepEqual(
            failures.map((f) => [f.playerId, f.reason]),
            [["a", PartyDungeonDenyReason.PARTY_TOO_LARGE]]
        );
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
