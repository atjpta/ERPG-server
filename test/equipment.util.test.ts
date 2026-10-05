import assert from "node:assert/strict";
import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import { buildClassLineages } from "@/modules/classes/utils/class-tree.util.js";
import {
    DEFAULT_EQUIPMENT_DISASSEMBLE_CONFIG,
    DEFAULT_EQUIPMENT_DROP_CONFIG,
    DEFAULT_EQUIPMENT_ENHANCE_CONFIG,
    DEFAULT_EQUIPMENT_REFINE_CONFIG,
    DEFAULT_EQUIPMENT_SET_CONFIG,
    DEFAULT_EQUIPMENT_STAT_CONFIG,
} from "@/modules/equipment/seeds/equipment-config.seed-data.js";
import {
    EquipmentDisassembleConfigSchema,
    EquipmentEnhanceConfigSchema,
    EquipmentRefineConfigSchema,
    EquipmentSetConfigSchema,
    EquipmentStatConfigSchema,
    type EquipmentSetEntry,
    type EquipmentStatEntry,
} from "@/modules/equipment/schemas/equipment-config.schema.js";
import {
    rollDropLevel,
    rollEquipmentInstance,
    type Rng,
} from "@/modules/equipment/utils/equipment-roll.util.js";
import { equipmentBonuses, setBonuses } from "@/modules/equipment/utils/equipment-stat.util.js";
import {
    applyEnhance,
    applyRefine,
    disassembleYield,
    enhanceCost,
    refineCost,
} from "@/modules/equipment/utils/equipment-upgrade.util.js";
import { EquipmentGroup, ItemEquipmentType } from "@/modules/items/enums/item-equipment.enum.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { StatKey, StatType } from "@/modules/player/enums/stat.enum.js";

/** Rng tất định: lặp lại dãy cho trước. */
const sequence = (...values: number[]): Rng => {
    let i = 0;
    return () => values[i++ % values.length];
};

const findEntry = (classCode: string | null, type: ItemEquipmentType, level: number) => {
    const entry = DEFAULT_EQUIPMENT_STAT_CONFIG.entries.find(
        (candidate) =>
            candidate.classCode === classCode &&
            candidate.equipmentType === type &&
            candidate.level === level
    );
    assert.ok(entry, `missing stat entry ${classCode}:${type}:${level}`);
    return entry as EquipmentStatEntry;
};

const instance = (
    patch: Partial<ItemEquipmentInstanceMetadata> = {}
): ItemEquipmentInstanceMetadata => ({
    level: 10,
    rarity: ItemRarity.COMMON,
    enhanceLevel: 0,
    refineLevel: 0,
    mainStats: [],
    subStats: [],
    rarityStats: [],
    ...patch,
});

describe("equipment config seed", () => {
    it("mọi config mặc định parse được bằng schema master data", () => {
        EquipmentStatConfigSchema.parse(DEFAULT_EQUIPMENT_STAT_CONFIG);
        EquipmentSetConfigSchema.parse(DEFAULT_EQUIPMENT_SET_CONFIG);
        EquipmentEnhanceConfigSchema.parse(DEFAULT_EQUIPMENT_ENHANCE_CONFIG);
        EquipmentRefineConfigSchema.parse(DEFAULT_EQUIPMENT_REFINE_CONFIG);
        EquipmentDisassembleConfigSchema.parse(DEFAULT_EQUIPMENT_DISASSEMBLE_CONFIG);
    });

    it("bảng stat riêng theo từng loại trang bị", () => {
        const head = findEntry("guardian", ItemEquipmentType.HEAD, 10);
        const ring = findEntry("guardian", ItemEquipmentType.RING, 10);
        assert.notDeepEqual(
            head.main.map((line) => line.stat),
            ring.main.map((line) => line.stat)
        );
    });
});

describe("equipment-roll.util", () => {
    it("số dòng rarity theo độ hiếm (common 1 → legendary 5), giá trị trong khoảng", () => {
        const entry = findEntry("swordman", ItemEquipmentType.MAIN_HAND, 20);
        const rarities = [
            ItemRarity.COMMON,
            ItemRarity.GOOD,
            ItemRarity.RARE,
            ItemRarity.EPIC,
            ItemRarity.LEGENDARY,
        ];
        rarities.forEach((rarity, index) => {
            const rolled = rollEquipmentInstance({
                entry,
                rarity,
                rarityLineCount: DEFAULT_EQUIPMENT_STAT_CONFIG.rarityLineCount,
                rng: sequence(0.1, 0.5, 0.9, 0.3),
            });
            assert.equal(rolled.rarityStats.length, index + 1);
            assert.equal(rolled.subStats.length, entry.subLineCount);
            assert.equal(rolled.level, 20);
            const keys = rolled.rarityStats.map((line) => `${line.stat}:${line.type}`);
            assert.equal(new Set(keys).size, keys.length, "dòng rarity không trùng nhau");
        });
        const rolled = rollEquipmentInstance({
            entry,
            rarity: ItemRarity.COMMON,
            rarityLineCount: DEFAULT_EQUIPMENT_STAT_CONFIG.rarityLineCount,
            rng: () => 0.999,
        });
        rolled.mainStats.forEach((line, i) => {
            assert.ok(line.value >= entry.main[i].min && line.value <= entry.main[i].max);
        });
    });

    it("quái lv 11 ra đồ lv10 nhiều hơn lv20, không ra mốc quá xa", () => {
        const counts = new Map<number, number>();
        for (let i = 0; i < 1000; i++) {
            const level = rollDropLevel(11, DEFAULT_EQUIPMENT_DROP_CONFIG, () => i / 1000);
            counts.set(level ?? 0, (counts.get(level ?? 0) ?? 0) + 1);
        }
        assert.ok((counts.get(10) ?? 0) > (counts.get(20) ?? 0));
        assert.ok((counts.get(20) ?? 0) > 0);
        assert.equal(counts.get(30) ?? 0, 0);
    });
});

describe("equipment-stat.util", () => {
    it("main × 1.05^enhance × 1.1^refine, sub/rarity giữ nguyên", () => {
        const bonuses = equipmentBonuses(
            instance({
                enhanceLevel: 10,
                refineLevel: 2,
                mainStats: [{ stat: StatKey.PHYSICAL_ATTACK, type: StatType.FLAT, value: 100 }],
                subStats: [{ stat: StatKey.MAX_HP, type: StatType.FLAT, value: 20 }],
            }),
            { enhance: 1.05, refine: 1.1 }
        );
        // 100 × 1.05^10 × 1.1^2 = 197.09624...
        assert.equal(bonuses[0].value, 197.0962);
        assert.equal(bonuses[1].value, 20);
    });

    it("set chỉ đếm các món cùng level", () => {
        const entry: EquipmentSetEntry = {
            biome: Biome.ORC,
            classCode: "guardian",
            group: EquipmentGroup.ARMOR,
            level: 10,
            bonuses: {
                "2": [{ stat: StatKey.MAX_HP, type: StatType.FLAT, value: 1 }],
                "4": [{ stat: StatKey.MAX_HP, type: StatType.FLAT, value: 10 }],
            },
        };
        const piece = (level: number) => ({
            biome: Biome.ORC,
            classCode: "guardian",
            group: EquipmentGroup.ARMOR,
            level,
        });
        const find = (_b: Biome, _c: string, _g: EquipmentGroup, level: number) =>
            level === 10 ? entry : undefined;
        // 3 món lv10 + 1 món lv20 → chỉ mốc 2 của set lv10.
        const bonuses = setBonuses([piece(10), piece(10), piece(10), piece(20)], find);
        assert.deepEqual(
            bonuses.map((bonus) => bonus.value),
            [1]
        );
        const full = setBonuses([piece(10), piece(10), piece(10), piece(10)], find);
        assert.deepEqual(
            full.map((bonus) => bonus.value).sort((a, b) => a - b),
            [1, 10]
        );
    });

    it("đồ tân thủ không có set", () => {
        const bonuses = setBonuses(
            [
                { biome: Biome.STARTER, classCode: null, group: EquipmentGroup.ARMOR, level: 1 },
                { biome: Biome.STARTER, classCode: null, group: EquipmentGroup.ARMOR, level: 1 },
            ],
            () => assert.fail("không được tra set")
        );
        assert.equal(bonuses.length, 0);
    });
});

describe("equipment-upgrade.util", () => {
    const config = DEFAULT_EQUIPMENT_ENHANCE_CONFIG;

    it("common tối đa +5 — muốn cao hơn phải tinh hoá", () => {
        const check = enhanceCost(instance({ enhanceLevel: 5 }), EquipmentGroup.WEAPON, config);
        assert.equal(check.ok, false);
        const good = enhanceCost(
            instance({ enhanceLevel: 5, rarity: ItemRarity.GOOD }),
            EquipmentGroup.WEAPON,
            config
        );
        assert.equal(good.ok, true);
        if (good.ok) {
            assert.deepEqual(
                good.value.materials.map((material) => material.code),
                ["enhance_stone_2", "dust_weapon"]
            );
        }
    });

    it("thất bại tụt 1 cấp, thấp nhất +0", () => {
        const step = { ...config.steps[0], downgradeOnFail: true };
        assert.equal(applyEnhance(instance({ enhanceLevel: 3 }), step, false).enhanceLevel, 2);
        assert.equal(applyEnhance(instance({ enhanceLevel: 0 }), step, false).enhanceLevel, 0);
        assert.equal(applyEnhance(instance({ enhanceLevel: 3 }), step, true).enhanceLevel, 4);
    });

    it("tinh hoá: lên rarity kế, +1 refineLevel, thêm 1 dòng rarity", () => {
        const entry = findEntry("mage", ItemEquipmentType.RING, 10);
        const base = rollEquipmentInstance({
            entry,
            rarity: ItemRarity.COMMON,
            rarityLineCount: DEFAULT_EQUIPMENT_STAT_CONFIG.rarityLineCount,
            rng: sequence(0.2, 0.7),
        });
        const cost = refineCost(base, DEFAULT_EQUIPMENT_REFINE_CONFIG);
        assert.ok(cost.ok);
        if (!cost.ok) return;
        assert.equal(cost.value.target, ItemRarity.GOOD);
        const refined = applyRefine({
            instance: base,
            target: cost.value.target,
            rarityLineCount: DEFAULT_EQUIPMENT_STAT_CONFIG.rarityLineCount,
            rarityPool: entry.rarityPool,
            rng: sequence(0.5),
        });
        assert.equal(refined.rarity, ItemRarity.GOOD);
        assert.equal(refined.refineLevel, 1);
        assert.equal(refined.rarityStats.length, 2);
        assert.equal(
            refineCost(instance({ rarity: ItemRarity.LEGENDARY }), DEFAULT_EQUIPMENT_REFINE_CONFIG)
                .ok,
            false
        );
    });

    it("phân rã: tinh linh theo rarity, bụi theo cấp cường hoá, bụi đúng nhóm", () => {
        const disassemble = DEFAULT_EQUIPMENT_DISASSEMBLE_CONFIG;
        const quantity = (yields: { code: string; quantity: number }[], code: string) =>
            yields.find((entry) => entry.code === code)?.quantity ?? 0;

        const common = disassembleYield(instance(), EquipmentGroup.ACCESSORY, disassemble);
        const epic = disassembleYield(
            instance({ rarity: ItemRarity.EPIC }),
            EquipmentGroup.ACCESSORY,
            disassemble
        );
        const enhanced = disassembleYield(
            instance({ enhanceLevel: 10 }),
            EquipmentGroup.ACCESSORY,
            disassemble
        );
        assert.ok(quantity(epic, "spirit") > quantity(common, "spirit"));
        assert.equal(quantity(epic, "dust_accessory"), quantity(common, "dust_accessory"));
        assert.ok(quantity(enhanced, "dust_accessory") > quantity(common, "dust_accessory"));
        assert.equal(quantity(enhanced, "spirit"), quantity(common, "spirit"));
        assert.equal(quantity(common, "dust_weapon"), 0);
    });
});

describe("class-tree.util", () => {
    it("class con mặc được đồ của class gốc, không ngược lại", () => {
        const lineages = buildClassLineages([
            { code: "swordman", nextClassCodes: ["knight"] },
            { code: "knight", nextClassCodes: ["paladin"] },
            { code: "paladin", nextClassCodes: [] },
            { code: "mage", nextClassCodes: [] },
        ]);
        assert.ok(lineages.get("paladin")?.has("swordman"));
        assert.ok(lineages.get("knight")?.has("swordman"));
        assert.ok(!lineages.get("swordman")?.has("knight"));
        assert.ok(!lineages.get("mage")?.has("swordman"));
    });
});
