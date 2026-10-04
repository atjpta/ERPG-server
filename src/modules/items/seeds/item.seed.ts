import { ItemEquipmentType } from "@/modules/items/enums/item-equipment.enum.js";
import { ItemRarity, ItemType } from "@/modules/items/enums/item.enum.js";
import { Items, type NewItem } from "@/modules/items/entities/item.entity.js";
import { ItemRepo } from "@/modules/items/repositories/item.repository.js";
import { parseItemMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { StatKey, StatType } from "@/modules/player/enums/stat.enum.js";

const ITEMS: NewItem[] = [
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
