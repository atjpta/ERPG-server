/**
 * Giá trị mặc định cho master data trang bị — sinh bằng công thức để có đủ bảng ban đầu, cân bằng
 * lại qua admin (`PUT /admin/master-data/:key`). Seed chạy lại sẽ ghi đè giá trị đang có.
 */
import { Big, big, bigToNumber } from "@/core/utils/big-number.util.js";
import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import {
    STARTER_CLASS_CODES,
    type StarterClassCode,
} from "@/modules/classes/constants/class.constant.js";
import {
    MAX_ENHANCE_LEVEL,
    type EquipmentDisassembleConfig,
    type EquipmentDropConfig,
    type EquipmentEnhanceConfig,
    type EquipmentRefineConfig,
    type EquipmentSetConfig,
    type EquipmentSetEntry,
    type EquipmentStatConfig,
    type EquipmentStatEntry,
    type StatRange,
    type WeightedStatRange,
} from "@/modules/equipment/schemas/equipment-config.schema.js";
import {
    EQUIPMENT_GROUP_BY_TYPE,
    EquipmentGroup,
    ItemEquipmentType,
    STARTER_EQUIPMENT_LEVEL,
} from "@/modules/items/enums/item-equipment.enum.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { StatKey, StatType } from "@/modules/player/enums/stat.enum.js";
import type { StatBonus } from "@/modules/player/schemas/stat.schema.js";

export const EQUIPMENT_LEVEL_TIERS = [10, 20, 30, 40, 50];
const SET_BIOMES = [Biome.ORC, Biome.SKELETON, Biome.SHAPESHIFTER];

const round4 = (value: Big | number) => bigToNumber(big(value));

/** Tăng theo level: chỉ số thường ×(1 + 0.2 × (lv − 1)); chỉ số tỉ lệ tăng chậm hơn. */
const SLOW_GROWTH_STATS = new Set<StatKey>([
    StatKey.CRITICAL_CHANCE,
    StatKey.CRITICAL_DAMAGE,
    StatKey.LIFE_STEAL,
    StatKey.PHYSICAL_PENETRATION,
    StatKey.MAGIC_PENETRATION,
]);
const levelFactor = (stat: StatKey, type: StatType, level: number) =>
    type === StatType.PERCENT || SLOW_GROWTH_STATS.has(stat)
        ? big(0.03)
              .times(level - 1)
              .plus(1)
        : big(0.2)
              .times(level - 1)
              .plus(1);

/** Chỉ số tấn công chính của class (đồ dùng chung: cả 2). */
const attackStats = (classCode: StarterClassCode | null): StatKey[] =>
    classCode === null
        ? [StatKey.PHYSICAL_ATTACK, StatKey.MAGIC_ATTACK]
        : classCode === "cleric"
          ? [StatKey.MAGIC_ATTACK]
          : [StatKey.PHYSICAL_ATTACK];

/** Hệ số theo class cho một số stat (swordsman đánh mạnh, archer chính xác, cleric nhiều mana/kháng phép...). */
const CLASS_STAT_SCALE: Record<StarterClassCode, Partial<Record<StatKey, number>>> = {
    swordsman: { [StatKey.PHYSICAL_ATTACK]: 1.1 },
    archer: { [StatKey.ACCURACY]: 1.2, [StatKey.EVASION]: 1.2 },
    cleric: { [StatKey.MAX_MP]: 1.4, [StatKey.MAGIC_DEFENSE]: 1.2, [StatKey.HP_REGEN]: 1.2 },
};

type BaseLine = [StatKey, number];

/** Dòng chính ở level 1 theo loại trang bị ("atk" = chỉ số tấn công của class). */
const mainLines = (type: ItemEquipmentType, classCode: StarterClassCode | null): BaseLine[] => {
    const atk = (value: number): BaseLine[] =>
        attackStats(classCode).map((stat): BaseLine => [stat, value]);
    switch (type) {
        case ItemEquipmentType.MAIN_HAND:
            return atk(8);
        case ItemEquipmentType.OFF_HAND:
            if (classCode === "archer") return [...atk(4), [StatKey.ACCURACY, 3]];
            if (classCode === "cleric") return [...atk(4), [StatKey.MAX_MP, 20]];
            return [...atk(4), [StatKey.CRITICAL_CHANCE, 0.005]];
        case ItemEquipmentType.HEAD:
            return [
                [StatKey.MAX_HP, 20],
                [StatKey.MAGIC_DEFENSE, 2],
            ];
        case ItemEquipmentType.ARMOR:
            return [
                [StatKey.PHYSICAL_DEFENSE, 4],
                [StatKey.MAX_HP, 30],
            ];
        case ItemEquipmentType.SHOULDER:
            return [
                [StatKey.PHYSICAL_DEFENSE, 2],
                [StatKey.MAGIC_DEFENSE, 2],
            ];
        case ItemEquipmentType.GLOVES:
            return [...atk(2), [StatKey.ACCURACY, 2]];
        case ItemEquipmentType.BOOTS:
            return [
                [StatKey.EVASION, 2],
                [StatKey.PHYSICAL_DEFENSE, 1],
            ];
        case ItemEquipmentType.BELT:
            return [
                [StatKey.MAX_HP, 25],
                [StatKey.MAX_MP, 10],
            ];
        case ItemEquipmentType.NECKLACE:
            return [
                [StatKey.MAX_MP, 15],
                [StatKey.MAGIC_DEFENSE, 2],
            ];
        case ItemEquipmentType.EARRING:
            return [
                [StatKey.CRITICAL_CHANCE, 0.005],
                [StatKey.ACCURACY, 1],
            ];
        case ItemEquipmentType.RING:
            return atk(3);
        case ItemEquipmentType.BACK:
            return [
                [StatKey.EVASION, 2],
                [StatKey.MAX_HP, 15],
            ];
    }
};

const PRIMARY_ATTRIBUTE: Record<StarterClassCode, StatKey> = {
    swordsman: StatKey.STRENGTH,
    archer: StatKey.DEXTERITY,
    cleric: StatKey.INTELLIGENCE,
};

/** Pool dòng phụ (FLAT) — attribute chính của class ra nhiều hơn. */
const subPool = (classCode: StarterClassCode | null): [StatKey, number, number][] => [
    ...[
        StatKey.STRENGTH,
        StatKey.DEXTERITY,
        StatKey.INTELLIGENCE,
        StatKey.VITALITY,
        StatKey.LUCK,
    ].map((stat): [StatKey, number, number] => [
        stat,
        2,
        classCode && PRIMARY_ATTRIBUTE[classCode] === stat ? 3 : 1,
    ]),
    [StatKey.MAX_HP, 15, 1],
    [StatKey.MAX_MP, 10, 1],
    ...attackStats(classCode).map((stat): [StatKey, number, number] => [stat, 3, 1]),
    [StatKey.PHYSICAL_DEFENSE, 2, 1],
    [StatKey.MAGIC_DEFENSE, 2, 1],
    [StatKey.ACCURACY, 2, 1],
    [StatKey.EVASION, 2, 1],
    [StatKey.HP_REGEN, 0.5, 1],
    [StatKey.MP_REGEN, 0.3, 1],
];

/** Pool dòng theo độ hiếm: chỉ số đặc biệt (tỉ lệ). */
const rarityPool = (classCode: StarterClassCode | null): [StatKey, StatType, number, number][] => [
    [StatKey.CRITICAL_CHANCE, StatType.FLAT, 0.01, 2],
    [StatKey.CRITICAL_DAMAGE, StatType.FLAT, 0.05, 2],
    [
        classCode === "cleric" ? StatKey.MAGIC_PENETRATION : StatKey.PHYSICAL_PENETRATION,
        StatType.FLAT,
        0.02,
        1,
    ],
    [StatKey.LIFE_STEAL, StatType.FLAT, 0.01, 1],
    [StatKey.DAMAGE_TO_MONSTERS, StatType.FLAT, 0.03, 1],
    [StatKey.DAMAGE_TO_BOSSES, StatType.FLAT, 0.03, 1],
    ...attackStats(classCode).map((stat): [StatKey, StatType, number, number] => [
        stat,
        StatType.PERCENT,
        0.03,
        2,
    ]),
    [StatKey.MAX_HP, StatType.PERCENT, 0.03, 2],
    [StatKey.MOVE_SPEED, StatType.PERCENT, 0.02, 1],
    [StatKey.EXP_BONUS, StatType.FLAT, 0.03, 1],
    [StatKey.GOLD_BONUS, StatType.FLAT, 0.03, 1],
    [StatKey.DROP_RATE, StatType.FLAT, 0.02, 1],
];

const range = (
    stat: StatKey,
    type: StatType,
    base: number,
    level: number,
    classCode: StarterClassCode | null
): StatRange => {
    const scale = classCode ? (CLASS_STAT_SCALE[classCode][stat] ?? 1) : 1;
    const value = big(base)
        .times(scale)
        .times(levelFactor(stat, type, level));
    return { stat, type, min: round4(value.times(0.8)), max: round4(value.times(1.2)) };
};

const statEntry = (
    classCode: StarterClassCode | null,
    equipmentType: ItemEquipmentType,
    level: number
): EquipmentStatEntry => ({
    classCode,
    equipmentType,
    level,
    main: mainLines(equipmentType, classCode).map(([stat, base]) =>
        range(stat, StatType.FLAT, base, level, classCode)
    ),
    subPool: subPool(classCode).map(([stat, base, weight]): WeightedStatRange => ({
        ...range(stat, StatType.FLAT, base, level, classCode),
        weight,
    })),
    subLineCount: 2,
    rarityPool: rarityPool(classCode).map(([stat, type, base, weight]): WeightedStatRange => ({
        ...range(stat, type, base, level, null),
        weight,
    })),
});

const ALL_TYPES = Object.values(ItemEquipmentType);
const isWeapon = (type: ItemEquipmentType) =>
    EQUIPMENT_GROUP_BY_TYPE[type] === EquipmentGroup.WEAPON;

export const DEFAULT_EQUIPMENT_STAT_CONFIG: EquipmentStatConfig = {
    rarityLineCount: {
        [ItemRarity.COMMON]: 1,
        [ItemRarity.GOOD]: 2,
        [ItemRarity.RARE]: 3,
        [ItemRarity.EPIC]: 4,
        [ItemRarity.LEGENDARY]: 5,
    },
    entries: [
        // Đồ tân thủ: giáp + trang sức dùng chung, vũ khí riêng từng class.
        ...ALL_TYPES.filter((type) => !isWeapon(type)).map((type) =>
            statEntry(null, type, STARTER_EQUIPMENT_LEVEL)
        ),
        ...STARTER_CLASS_CODES.flatMap((classCode) =>
            ALL_TYPES.filter(isWeapon).map((type) =>
                statEntry(classCode, type, STARTER_EQUIPMENT_LEVEL)
            )
        ),
        // Đồ biome theo mốc level.
        ...STARTER_CLASS_CODES.flatMap((classCode) =>
            ALL_TYPES.flatMap((type) =>
                EQUIPMENT_LEVEL_TIERS.map((level) => statEntry(classCode, type, level))
            )
        ),
    ],
};

/** Dòng đặc trưng của set từng biome (mốc cao nhất của nhóm). */
const BIOME_SET_SIGNATURE: Record<Biome, (atk: StatKey) => StatBonus[]> = {
    [Biome.STARTER]: () => [],
    [Biome.ORC]: (atk) => [
        { stat: atk, type: StatType.PERCENT, value: 0.08 },
        { stat: StatKey.MAX_HP, type: StatType.PERCENT, value: 0.05 },
    ],
    [Biome.SKELETON]: () => [
        { stat: StatKey.PHYSICAL_DEFENSE, type: StatType.PERCENT, value: 0.08 },
        { stat: StatKey.DAMAGE_TO_BOSSES, type: StatType.FLAT, value: 0.05 },
    ],
    [Biome.SHAPESHIFTER]: () => [
        { stat: StatKey.EVASION, type: StatType.PERCENT, value: 0.08 },
        { stat: StatKey.CRITICAL_DAMAGE, type: StatType.FLAT, value: 0.1 },
    ],
};

const scaleBonuses = (bonuses: StatBonus[], factor: Big): StatBonus[] =>
    bonuses.map((bonus) => ({ ...bonus, value: round4(big(bonus.value).times(factor)) }));

const setEntry = (
    biome: Biome,
    classCode: StarterClassCode,
    group: EquipmentGroup,
    level: number
): EquipmentSetEntry => {
    const atk = attackStats(classCode)[0];
    // lv10 ×1 → lv50 ×2
    const factor = big(level - EQUIPMENT_LEVEL_TIERS[0])
        .div(40)
        .plus(1);
    const signature = BIOME_SET_SIGNATURE[biome](atk);
    const bonuses: Record<string, StatBonus[]> =
        group === EquipmentGroup.WEAPON
            ? { "2": signature }
            : group === EquipmentGroup.ARMOR
              ? {
                    "2": [{ stat: StatKey.PHYSICAL_DEFENSE, type: StatType.PERCENT, value: 0.05 }],
                    "4": [{ stat: StatKey.MAX_HP, type: StatType.PERCENT, value: 0.08 }],
                    "6": signature,
                }
              : {
                    "2": [{ stat: atk, type: StatType.PERCENT, value: 0.05 }],
                    "4": [{ stat: StatKey.CRITICAL_CHANCE, type: StatType.FLAT, value: 0.03 }],
                    "6": signature,
                };
    return {
        biome,
        classCode,
        group,
        level,
        bonuses: Object.fromEntries(
            Object.entries(bonuses).map(([pieces, list]) => [pieces, scaleBonuses(list, factor)])
        ),
    };
};

export const DEFAULT_EQUIPMENT_SET_CONFIG: EquipmentSetConfig = {
    entries: SET_BIOMES.flatMap((biome) =>
        STARTER_CLASS_CODES.flatMap((classCode) =>
            Object.values(EquipmentGroup).flatMap((group) =>
                EQUIPMENT_LEVEL_TIERS.map((level) => setEntry(biome, classCode, group, level))
            )
        )
    ),
};

const LEVEL_COST_SCALE: Record<string, number> = {
    [STARTER_EQUIPMENT_LEVEL]: 0.5,
    10: 1,
    20: 2,
    30: 3.5,
    40: 5.5,
    50: 8,
};

const DUST_CODE_BY_GROUP: Record<EquipmentGroup, string> = {
    [EquipmentGroup.WEAPON]: "dust_weapon",
    [EquipmentGroup.ARMOR]: "dust_armor",
    [EquipmentGroup.ACCESSORY]: "dust_accessory",
};

export const DEFAULT_EQUIPMENT_ENHANCE_CONFIG: EquipmentEnhanceConfig = {
    mainStatGrowth: 1.05,
    maxByRarity: {
        [ItemRarity.COMMON]: 5,
        [ItemRarity.GOOD]: 10,
        [ItemRarity.RARE]: 15,
        [ItemRarity.EPIC]: 20,
        [ItemRarity.LEGENDARY]: 25,
    },
    dustCodeByGroup: DUST_CODE_BY_GROUP,
    steps: Array.from({ length: MAX_ENHANCE_LEVEL }, (_, index) => {
        const target = index + 1;
        return {
            rate: round4(Big.max(0.15, big(1).minus(big(0.035).times(index)))),
            gold: big(1.25).pow(index).times(100).integerValue(Big.ROUND_HALF_UP).toNumber(),
            stoneCode: `enhance_stone_${Math.ceil(target / 5)}`,
            stoneQty: 1 + (index % 5),
            dustQty: 2 * target,
            downgradeOnFail: true,
        };
    }),
    levelCostScale: LEVEL_COST_SCALE,
};

export const DEFAULT_EQUIPMENT_REFINE_CONFIG: EquipmentRefineConfig = {
    mainStatGrowth: 1.1,
    spiritCode: "spirit",
    steps: {
        [ItemRarity.GOOD]: { rate: 0.8, gold: 1_000, spiritQty: 10 },
        [ItemRarity.RARE]: { rate: 0.6, gold: 5_000, spiritQty: 30 },
        [ItemRarity.EPIC]: { rate: 0.4, gold: 20_000, spiritQty: 80 },
        [ItemRarity.LEGENDARY]: { rate: 0.25, gold: 80_000, spiritQty: 200 },
    },
    levelCostScale: LEVEL_COST_SCALE,
};

export const DEFAULT_EQUIPMENT_DISASSEMBLE_CONFIG: EquipmentDisassembleConfig = {
    spiritCode: "spirit",
    dustCodeByGroup: DUST_CODE_BY_GROUP,
    spiritBase: 2,
    dustBase: 3,
    levelScale: LEVEL_COST_SCALE,
    rarityScale: {
        [ItemRarity.COMMON]: 1,
        [ItemRarity.GOOD]: 2,
        [ItemRarity.RARE]: 4,
        [ItemRarity.EPIC]: 8,
        [ItemRarity.LEGENDARY]: 16,
    },
    enhanceScale: Array.from({ length: MAX_ENHANCE_LEVEL + 1 }, (_, level) =>
        round4(big(level).times(0.5).plus(1))
    ),
    groupScale: {
        [EquipmentGroup.WEAPON]: 1.5,
        [EquipmentGroup.ARMOR]: 1,
        [EquipmentGroup.ACCESSORY]: 1.2,
    },
};

export const DEFAULT_EQUIPMENT_DROP_CONFIG: EquipmentDropConfig = {
    levelTiers: EQUIPMENT_LEVEL_TIERS,
    levelRange: 15,
};
