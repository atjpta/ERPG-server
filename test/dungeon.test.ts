import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DungeonDefSchema } from "@/modules/maps/schemas/map-definition.schema.js";
import { dungeonMonsterLevel, phasesMonsterCount } from "@/modules/maps/utils/dungeon.util.js";

const spawn = (count: number) => ({ monsterCode: "slime", count, spawnX: 1, spawnY: 1 });
const group = (markerId: string, count: number) => ({
    markerId,
    members: [{ monsterCode: "slime", count }],
});
const chamber = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    phases: [
        { id: "p1", delaySec: 0, groups: [group(`${id}_1`, 3)] },
        { id: "p2", delaySec: 20, groups: [group(`${id}_2`, 2)] },
    ],
    ...extra,
});

describe("dungeonMonsterLevel", () => {
    it("trung bình làm tròn lên, kẹp [1, maxLevel]", () => {
        assert.equal(dungeonMonsterLevel([3, 4], 10), 4);
        assert.equal(dungeonMonsterLevel([9, 12], 10), 10);
        assert.equal(dungeonMonsterLevel([], 10), 1);
        assert.equal(dungeonMonsterLevel([1], 10), 1);
    });
});

describe("phasesMonsterCount", () => {
    it("cộng count của mọi spawn trong các phase", () => {
        assert.equal(
            phasesMonsterCount([{ monsterSpawns: [spawn(3)] }, { monsterSpawns: [spawn(2)] }]),
            5
        );
        assert.equal(phasesMonsterCount([]), 0);
    });
});

describe("DungeonDefSchema", () => {
    it("hợp lệ: chamber cuối là boss, các chamber trước có exit", () => {
        const parsed = DungeonDefSchema.safeParse({
            maxLevel: 10,
            chambers: [chamber("a"), chamber("b", { isBoss: true })],
        });
        assert.equal(parsed.success, true);
    });

    it("chamber không phải cuối mà thiếu exit bị từ chối", () => {
        const parsed = DungeonDefSchema.safeParse({
            maxLevel: 10,
            chambers: [chamber("a", { hasExit: false }), chamber("b", { isBoss: true })],
        });
        assert.equal(parsed.success, false);
    });

    it("chỉ chamber cuối được là boss", () => {
        const parsed = DungeonDefSchema.safeParse({
            maxLevel: 10,
            chambers: [chamber("a", { isBoss: true }), chamber("b")],
        });
        assert.equal(parsed.success, false);
    });

    it("phase đầu phải spawn lúc 0 và delaySec phải tăng dần", () => {
        const late = chamber("a", {
            phases: [{ id: "p1", delaySec: 5, groups: [group("m", 1)] }],
        });
        assert.equal(
            DungeonDefSchema.safeParse({
                maxLevel: 10,
                chambers: [late, chamber("b", { isBoss: true })],
            }).success,
            false
        );
        const same = chamber("a", {
            phases: [
                { id: "p1", delaySec: 0, groups: [group("m1", 1)] },
                { id: "p2", delaySec: 0, groups: [group("m2", 1)] },
            ],
        });
        assert.equal(
            DungeonDefSchema.safeParse({
                maxLevel: 10,
                chambers: [same, chamber("b", { isBoss: true })],
            }).success,
            false
        );
    });
});
