import { ItemCode } from "@/modules/items/enums/item-code.enum.js";
import { ItemRarity, ItemType } from "@/modules/items/enums/item.enum.js";
import type { NewItem } from "@/modules/items/entities/item.entity.js";
import {
    BIOME_EQUIPMENT_ITEMS,
    STARTER_EQUIPMENT_ITEMS,
} from "@/modules/items/seeds/equipment-item.seed-data.js";

const MATERIAL_MAX_STACK = 9999;

const material = (code: string, rarity: ItemRarity, sellPrice: number): NewItem => ({
    code,
    type: ItemType.MATERIAL,
    rarity,
    requiredLevel: 1,
    stackable: true,
    maxStack: MATERIAL_MAX_STACK,
    sellPrice,
    metadata: {},
});

/**
 * Nguyên liệu nâng cấp trang bị — được tham chiếu theo code trong master data
 * `equipment_enhance_config` / `equipment_refine_config` / `equipment_disassemble_config`.
 */
const MATERIALS: NewItem[] = [
    // Đá cường hoá: bậc 1 dùng cho +1…+5, bậc 2 cho +6…+10, … bậc 5 cho +21…+25.
    material(ItemCode.ENHANCE_STONE_1, ItemRarity.COMMON, 5),
    material(ItemCode.ENHANCE_STONE_2, ItemRarity.GOOD, 10),
    material(ItemCode.ENHANCE_STONE_3, ItemRarity.RARE, 20),
    material(ItemCode.ENHANCE_STONE_4, ItemRarity.EPIC, 40),
    material(ItemCode.ENHANCE_STONE_5, ItemRarity.LEGENDARY, 80),
    // Bụi cường hoá theo nhóm trang bị (phân rã ra bụi đúng nhóm).
    material(ItemCode.DUST_ARMOR, ItemRarity.COMMON, 1),
    material(ItemCode.DUST_WEAPON, ItemRarity.COMMON, 1),
    material(ItemCode.DUST_ACCESSORY, ItemRarity.COMMON, 1),
    // Tinh linh: phân rã trang bị, dùng để tinh hoá.
    material(ItemCode.SPIRIT, ItemRarity.RARE, 2),
];

export const ITEMS: NewItem[] = [
    ...MATERIALS,
    ...STARTER_EQUIPMENT_ITEMS,
    ...BIOME_EQUIPMENT_ITEMS,
    {
        code: ItemCode.HP_POTION_SMALL,
        type: ItemType.CONSUMABLE,
        rarity: ItemRarity.COMMON,
        requiredLevel: 1,
        stackable: true,
        maxStack: 99,
        sellPrice: 2,
        metadata: { heal: 50 },
    },
    {
        code: ItemCode.MP_POTION_SMALL,
        type: ItemType.CONSUMABLE,
        rarity: ItemRarity.COMMON,
        requiredLevel: 1,
        stackable: true,
        maxStack: 99,
        sellPrice: 2,
        metadata: { mana: 30 },
    },
];
