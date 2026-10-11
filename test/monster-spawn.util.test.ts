import assert from "node:assert/strict";
import type { MonsterDrops } from "@/modules/monsters/schemas/monster-drop.schema.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { MonsterType, RANDOM_MONSTER_TYPE } from "@/modules/monsters/enums/monster-type.enum.js";
import { DEFAULT_MONSTER_SPAWN_CONFIG } from "@/modules/monsters/seeds/monster.seed-data.js";
import { MonsterSpawnConfigSchema } from "@/modules/monsters/schemas/monster-spawn-config.schema.js";
import {
    monsterExpAtLevel,
    rollMonsterLevel,
    rollMonsterVariant,
    scaleDropsToLevel,
} from "@/modules/monsters/utils/monster-spawn.util.js";

const config = DEFAULT_MONSTER_SPAWN_CONFIG;
const always = () => 0;
const never = () => 0.999;

describe("monster-spawn.util — rollMonsterVariant", () => {
    it("spawn cố định loại thì giữ nguyên, không có loại → normal", () => {
        assert.equal(rollMonsterVariant({ type: MonsterType.BOSS }, config, 0, never).type, "boss");
        assert.equal(rollMonsterVariant({}, config, 0, always).type, MonsterType.NORMAL);
    });

    it("spawn random: trúng eliteChance → elite, trượt → normal", () => {
        const spawn = { type: RANDOM_MONSTER_TYPE } as const;
        assert.equal(rollMonsterVariant(spawn, config, 0, always).type, MonsterType.ELITE);
        assert.equal(rollMonsterVariant(spawn, config, 0, never).type, MonsterType.NORMAL);
    });

    it("map đã đủ elite thì spawn random ra normal dù trúng tỉ lệ", () => {
        const spawn = { type: RANDOM_MONSTER_TYPE } as const;
        assert.equal(rollMonsterVariant(spawn, config, 1, always).type, MonsterType.NORMAL);
        const two = { ...config, maxElitesPerMap: 2 };
        assert.equal(rollMonsterVariant(spawn, two, 1, always).type, MonsterType.ELITE);
    });

    it("độ hiếm: cố định theo spawn, không thì roll theo trọng số của loại", () => {
        assert.equal(
            rollMonsterVariant({ rarity: ItemRarity.EPIC }, config, 0, always).rarity,
            ItemRarity.EPIC
        );
        assert.equal(rollMonsterVariant({}, config, 0, always).rarity, ItemRarity.COMMON);
        const elite = rollMonsterVariant({ type: MonsterType.ELITE }, config, 0, never);
        assert.equal(elite.rarity, ItemRarity.EPIC);
    });
});

describe("monster-spawn.util — rollMonsterLevel", () => {
    it("không có khoảng → level của monster", () => {
        assert.equal(rollMonsterLevel(22, {}), 22);
    });

    it("roll trong [minLevel, maxLevel], gồm cả hai đầu", () => {
        assert.equal(rollMonsterLevel(22, { minLevel: 2, maxLevel: 5 }, always), 2);
        assert.equal(rollMonsterLevel(22, { minLevel: 2, maxLevel: 5 }, never), 5);
        assert.equal(rollMonsterLevel(22, { minLevel: 3, maxLevel: 3 }, never), 3);
    });
});

describe("monster-spawn.util — scaleDropsToLevel", () => {
    const drops: MonsterDrops = {
        currency: [{ code: CurrencyCode.GOLD, min: 10, max: 100 }],
        items: [],
        exp: Math.floor(monsterExpAtLevel(10)),
    };

    it("cùng level → giữ nguyên", () => {
        assert.equal(scaleDropsToLevel(drops, 10, 10), drops);
    });

    it("level thấp hơn → exp và tiền giảm theo tỉ lệ", () => {
        const scaled = scaleDropsToLevel(drops, 10, 5);
        assert.equal(
            scaled.exp,
            Math.floor(drops.exp * (monsterExpAtLevel(5) / monsterExpAtLevel(10)))
        );
        assert.deepEqual(scaled.currency[0], { code: "gold", min: 5, max: 50 });
    });
});

describe("monster_spawn_config", () => {
    it("mặc định hợp lệ; loại không có trọng số nào > 0 bị từ chối", () => {
        assert.ok(MonsterSpawnConfigSchema.safeParse(config).success);
        const bad = {
            ...config,
            rarityWeights: { ...config.rarityWeights, [MonsterType.BOSS]: { epic: 0 } },
        };
        assert.equal(MonsterSpawnConfigSchema.safeParse(bad).success, false);
    });
});
