import { ItemEquipmentType } from "@/modules/items/enums/item-equipment.enum.js";
import { ItemRarity, ItemType } from "@/modules/items/enums/item.enum.js";
import { Items, type NewItem } from "@/modules/items/entities/item.entity.js";
import { ItemRepo } from "@/modules/items/repositories/item.repository.js";
import { parseItemMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { StatKey, StatType } from "@/modules/player/enums/stat.enum.js";

const MATERIAL_MAX_STACK = 9999;

const material = (code: string, name: string, rarity: ItemRarity, sellPrice: number): NewItem => ({
    code,
    name,
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
    material("enhance_stone_1", "Enhance Stone I", ItemRarity.COMMON, 5),
    material("enhance_stone_2", "Enhance Stone II", ItemRarity.GOOD, 10),
    material("enhance_stone_3", "Enhance Stone III", ItemRarity.RARE, 20),
    material("enhance_stone_4", "Enhance Stone IV", ItemRarity.EPIC, 40),
    material("enhance_stone_5", "Enhance Stone V", ItemRarity.LEGENDARY, 80),
    // Bụi cường hoá theo nhóm trang bị (phân rã ra bụi đúng nhóm).
    material("dust_armor", "Armor Dust", ItemRarity.COMMON, 1),
    material("dust_weapon", "Weapon Dust", ItemRarity.COMMON, 1),
    material("dust_accessory", "Accessory Dust", ItemRarity.COMMON, 1),
    // Tinh linh: phân rã trang bị, dùng để tinh hoá.
    material("spirit", "Spirit", ItemRarity.RARE, 2),
];

const ITEMS: NewItem[] = [
    ...MATERIALS,
    {
        code: "wooden_sword",
        name: "Wooden Sword",
        type: ItemType.EQUIPMENT,
        rarity: ItemRarity.COMMON,
        requiredLevel: 1,
        stackable: false,
        maxStack: 1,
        sellPrice: 10,
        metadata: {
            equipmentType: ItemEquipmentType.MAIN_HAND,
            stats: [{ stat: StatKey.PHYSICAL_ATTACK, type: StatType.FLAT, value: 5 }],
            rollConfig: {
                pool: [
                    { stat: StatKey.STRENGTH, type: StatType.FLAT, min: 1, max: 3, weight: 1 },
                    {
                        stat: StatKey.CRITICAL_CHANCE,
                        type: StatType.FLAT,
                        min: 0.01,
                        max: 0.03,
                        weight: 1,
                    },
                ],
                linesByRarity: {
                    [ItemRarity.COMMON]: 0,
                    [ItemRarity.RARE]: 1,
                    [ItemRarity.EPIC]: 2,
                    [ItemRarity.LEGENDARY]: 3,
                },
            },
        },
    },
    {
        code: "hp_potion_small",
        name: "Small HP Potion",
        type: ItemType.CONSUMABLE,
        rarity: ItemRarity.COMMON,
        requiredLevel: 1,
        stackable: true,
        maxStack: 99,
        sellPrice: 2,
        metadata: { heal: 50 },
    },
];

export const ItemSeed = async () => {
    for (const item of ITEMS) {
        parseItemMetadata(item.type, item.metadata); // seed sai cấu trúc thì dừng ngay
        await ItemRepo.upsert({
            data: item,
            target: Items.code,
            matchValue: item.code,
            updateData: item,
        });
    }
    console.info("✅ [ItemSeed] Done");
};
