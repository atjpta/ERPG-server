import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DungeonDefSchema } from "@/modules/maps/schemas/map-definition.schema.js";
import type { MonsterDrops } from "@/modules/monsters/schemas/monster-drop.schema.js";
import {
    DungeonDropConfigSchema,
    DungeonDropTuningSchema,
} from "@/modules/maps/schemas/dungeon-drop.schema.js";
import { DEFAULT_DUNGEON_DROP_CONFIG } from "@/modules/maps/seeds/dungeon-drop-config.seed-data.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { loadMapDefinitions } from "@/modules/maps/seeds/game-map.seed.js";
import { big } from "@/core/utils/big-number.util.js";
import { applyDungeonScale, tuneDungeonDrops } from "@/modules/maps/utils/dungeon-drop.util.js";
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

describe("dungeon drop tuning", () => {
    const drops: MonsterDrops = {
        currency: [],
        items: [{ itemId: "11111111-1111-4111-8111-111111111111", min: 1, max: 2, rate: 0.1 }],
        equipment: { rate: 0.08, rarity: { common: 60 } },
        exp: 100,
    };
    const itemId = (code: string) =>
        code === "gem" ? "22222222-2222-4222-8222-222222222222" : undefined;

    it("ghi đè tỉ lệ + rarity trang bị, giữ nguyên khi không chỉnh", () => {
        const tuned = tuneDungeonDrops(
            drops,
            { equipmentRate: 0.5, equipmentRarity: { rare: 1 } },
            { itemId }
        );
        assert.deepEqual(tuned.equipment, { rate: 0.5, rarity: { rare: 1 } });
        assert.deepEqual(tuneDungeonDrops(drops, {}, { itemId }).equipment, drops.equipment);
    });

    it("item rơi thêm: bossOnly chỉ cho boss, item không tồn tại bị bỏ", () => {
        const tuning = {
            extraItems: [
                { itemCode: "gem", min: 1, max: 1, rate: 1, bossOnly: true },
                { itemCode: "ghost", min: 1, max: 1, rate: 1 },
            ],
        };
        assert.equal(tuneDungeonDrops(drops, tuning, { itemId }).items.length, 1);
        assert.equal(tuneDungeonDrops(drops, tuning, { itemId }).items.length, 2);
    });

    it("hệ số exp / vàng / tỉ lệ rơi nhân vào scale", () => {
        const scale = applyDungeonScale(
            { exp: big(2), gold: big(1), dropRate: big(3) },
            { expMultiplier: 1.5, dropRateMultiplier: 2 }
        );
        assert.equal(scale.exp.toNumber(), 3);
        assert.equal(scale.gold.toNumber(), 1);
        assert.equal(scale.dropRate.toNumber(), 6);
    });

    it("schema từ chối min > max và config mặc định hợp lệ", () => {
        assert.equal(
            DungeonDropTuningSchema.safeParse({
                extraItems: [{ itemCode: "gem", min: 3, max: 1, rate: 0.5 }],
            }).success,
            false
        );
        assert.doesNotThrow(() => DungeonDropConfigSchema.parse(DEFAULT_DUNGEON_DROP_CONFIG));
    });

    it("mặc định chỉnh đúng 3 dungeon đã khai báo", () => {
        const dungeons = loadMapDefinitions()
            .filter((map) => map.type === MapType.DUNGEON)
            .map((map) => map.code);
        assert.deepEqual(Object.keys(DEFAULT_DUNGEON_DROP_CONFIG.byMap).sort(), dungeons.sort());
    });
});
