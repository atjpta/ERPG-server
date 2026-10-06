import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import { STARTER_CLASS_CODES } from "@/modules/classes/constants/class.constant.js";
import { equipmentItemCode } from "@/modules/equipment/utils/equipment-code.util.js";
import type { NewItem } from "@/modules/items/entities/item.entity.js";
import {
    EQUIPMENT_GROUP_BY_TYPE,
    EquipmentGroup,
    ItemEquipmentType,
} from "@/modules/items/enums/item-equipment.enum.js";
import { ItemRarity, ItemType } from "@/modules/items/enums/item.enum.js";
import type { EquipmentMetadata } from "@/modules/items/schemas/item-metadata.schema.js";

const BIOME_NAMES: Record<Biome, string> = {
    [Biome.STARTER]: "Novice",
    [Biome.ORC]: "Orc",
    [Biome.SKELETON]: "Skeleton",
    [Biome.SHAPESHIFTER]: "Shapeshifter",
};

const CLASS_NAMES: Record<string, string> = {
    swordsman: "Swordsman",
    archer: "Archer",
    cleric: "Cleric",
};

const TYPE_NAMES: Record<ItemEquipmentType, string> = {
    [ItemEquipmentType.MAIN_HAND]: "Weapon",
    [ItemEquipmentType.OFF_HAND]: "Off-hand",
    [ItemEquipmentType.HEAD]: "Helm",
    [ItemEquipmentType.ARMOR]: "Armor",
    [ItemEquipmentType.SHOULDER]: "Pauldrons",
    [ItemEquipmentType.GLOVES]: "Gloves",
    [ItemEquipmentType.BOOTS]: "Boots",
    [ItemEquipmentType.BELT]: "Belt",
    [ItemEquipmentType.NECKLACE]: "Necklace",
    [ItemEquipmentType.EARRING]: "Earring",
    [ItemEquipmentType.RING]: "Ring",
    [ItemEquipmentType.BACK]: "Cloak",
};

/** Vũ khí riêng từng class (khớp icon `{type}_{class}_default` bên client) — tên không lặp lại class. */
const WEAPON_NAMES: Record<
    string,
    Record<ItemEquipmentType.MAIN_HAND | ItemEquipmentType.OFF_HAND, string>
> = {
    swordsman: {
        [ItemEquipmentType.MAIN_HAND]: "Sword",
        [ItemEquipmentType.OFF_HAND]: "Buckler",
    },
    archer: { [ItemEquipmentType.MAIN_HAND]: "Bow", [ItemEquipmentType.OFF_HAND]: "Arrows" },
    cleric: { [ItemEquipmentType.MAIN_HAND]: "Staff", [ItemEquipmentType.OFF_HAND]: "Holy Orb" },
};

/** "Orc Sword" cho vũ khí, "Orc Swordsman Helm" cho giáp/trang sức theo class, "Novice Belt" cho đồ dùng chung. */
const equipmentName = (biome: Biome, classCode: string | null, type: ItemEquipmentType) => {
    const weapon =
        classCode && (type === ItemEquipmentType.MAIN_HAND || type === ItemEquipmentType.OFF_HAND)
            ? WEAPON_NAMES[classCode]?.[type]
            : undefined;
    if (weapon) return `${BIOME_NAMES[biome]} ${weapon}`;
    const owner = classCode ? `${CLASS_NAMES[classCode] ?? classCode} ` : "";
    return `${BIOME_NAMES[biome]} ${owner}${TYPE_NAMES[type]}`;
};

const equipment = (
    biome: Biome,
    classCode: string | null,
    equipmentType: ItemEquipmentType
): NewItem => {
    const metadata: EquipmentMetadata = { equipmentType, biome, classCode };
    return {
        code: equipmentItemCode(biome, classCode, equipmentType),
        name: equipmentName(biome, classCode, equipmentType),
        type: ItemType.EQUIPMENT,
        // Rarity/level thật nằm ở từng món (instance metadata).
        rarity: ItemRarity.COMMON,
        requiredLevel: 1,
        stackable: false,
        maxStack: 1,
        sellPrice: biome === Biome.STARTER ? 1 : 10,
        metadata,
    };
};

const ALL_TYPES = Object.values(ItemEquipmentType);
const isWeapon = (type: ItemEquipmentType) =>
    EQUIPMENT_GROUP_BY_TYPE[type] === EquipmentGroup.WEAPON;

/** Đồ tân thủ: giáp + trang sức dùng chung mọi class, vũ khí riêng từng class. */
export const STARTER_EQUIPMENT_ITEMS: NewItem[] = [
    ...ALL_TYPES.filter((type) => !isWeapon(type)).map((type) =>
        equipment(Biome.STARTER, null, type)
    ),
    ...STARTER_CLASS_CODES.flatMap((classCode) =>
        ALL_TYPES.filter(isWeapon).map((type) => equipment(Biome.STARTER, classCode, type))
    ),
];

/** Đồ biome: mỗi biome 1 bộ đủ 12 loại cho từng class. */
export const BIOME_EQUIPMENT_ITEMS: NewItem[] = [
    Biome.ORC,
    Biome.SKELETON,
    Biome.SHAPESHIFTER,
].flatMap((biome) =>
    STARTER_CLASS_CODES.flatMap((classCode) =>
        ALL_TYPES.map((type) => equipment(biome, classCode, type))
    )
);
