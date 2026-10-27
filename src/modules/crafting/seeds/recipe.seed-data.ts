import { RecipeCode } from "@/modules/crafting/enums/recipe-code.enum.js";
import { RecipeGroupCode } from "@/modules/crafting/enums/recipe-group-code.enum.js";
import type { RecipeDefinitionInput } from "@/modules/crafting/schemas/recipe.schema.js";
import { ItemCode } from "@/modules/items/enums/item-code.enum.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { StatKey, StatType } from "@/modules/player/enums/stat.enum.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";

/**
 * Công thức chế tạo. `ingredients[].order` là thứ tự hiển thị; trang bị có `resultMetadata` thì chỉ số cố định, không có thì roll theo
 * `resultLevel` + `resultRarity`. Tên hiển thị tra locale `recipe.{code}.name`.
 */
export const RECIPES: (RecipeDefinitionInput & { code: RecipeCode })[] = [
    // ---- Giả kim: bình thuốc, đá cường hoá ------------------------------------------------------------
    {
        code: RecipeCode.CRAFT_HP_POTION_SMALL,
        groupCodes: [RecipeGroupCode.ALCHEMY],
        sortOrder: 0,
        resultItemCode: ItemCode.HP_POTION_SMALL,
        resultQuantity: 5,
        ingredients: [{ itemCode: ItemCode.SPIRIT, quantity: 1, order: 0 }],
        cost: [{ code: CurrencyCode.GOLD, amount: 50 }],
    },
    {
        code: RecipeCode.CRAFT_MP_POTION_SMALL,
        groupCodes: [RecipeGroupCode.ALCHEMY],
        sortOrder: 1,
        resultItemCode: ItemCode.MP_POTION_SMALL,
        resultQuantity: 5,
        ingredients: [{ itemCode: ItemCode.SPIRIT, quantity: 1, order: 0 }],
        cost: [{ code: CurrencyCode.GOLD, amount: 50 }],
    },
    // Một công thức thuộc nhiều nhóm: thợ rèn và giả kim đều chế được đá cường hoá.
    {
        code: RecipeCode.CRAFT_ENHANCE_STONE_2,
        groupCodes: [RecipeGroupCode.ALCHEMY, RecipeGroupCode.SMITHING],
        sortOrder: 2,
        resultItemCode: ItemCode.ENHANCE_STONE_2,
        ingredients: [{ itemCode: ItemCode.ENHANCE_STONE_1, quantity: 3, order: 0 }],
        cost: [{ code: CurrencyCode.GOLD, amount: 100 }],
    },
    // ---- Thợ rèn: trang bị ------------------------------------------------------------------------------
    // Không khai metadata: roll ngẫu nhiên như rơi đồ ở level 10, độ hiếm "good".
    {
        code: RecipeCode.CRAFT_SLIME_SWORDSMAN_MAIN_HAND,
        groupCodes: [RecipeGroupCode.SMITHING],
        sortOrder: 0,
        requiredLevel: 10,
        resultItemCode: ItemCode.SLIME_SWORDSMAN_MAIN_HAND,
        resultLevel: 10,
        resultRarity: ItemRarity.GOOD,
        ingredients: [
            { itemCode: ItemCode.DUST_WEAPON, quantity: 10, order: 0 },
            { itemCode: ItemCode.SPIRIT, quantity: 2, order: 1 },
        ],
        cost: [{ code: CurrencyCode.GOLD, amount: 500 }],
    },
    // Chỉ số cố định: mọi lần chế ra đúng thanh kiếm này.
    {
        code: RecipeCode.CRAFT_SLIME_SWORDSMAN_MAIN_HAND_FIXED,
        groupCodes: [RecipeGroupCode.SMITHING],
        sortOrder: 1,
        requiredLevel: 10,
        resultItemCode: ItemCode.SLIME_SWORDSMAN_MAIN_HAND,
        resultMetadata: {
            level: 10,
            rarity: ItemRarity.GOOD,
            enhanceLevel: 0,
            refineLevel: 0,
            mainStats: [{ stat: StatKey.PHYSICAL_ATTACK, type: StatType.FLAT, value: 26 }],
            subStats: [
                { stat: StatKey.CRITICAL_CHANCE, type: StatType.PERCENT, value: 0.02 },
                { stat: StatKey.ACCURACY, type: StatType.FLAT, value: 5 },
            ],
            rarityStats: [
                { stat: StatKey.MAX_HP, type: StatType.FLAT, value: 40 },
                { stat: StatKey.PHYSICAL_PENETRATION, type: StatType.FLAT, value: 3 },
            ],
        },
        ingredients: [
            { itemCode: ItemCode.DUST_WEAPON, quantity: 20, order: 0 },
            { itemCode: ItemCode.ENHANCE_STONE_2, quantity: 3, order: 1 },
        ],
        cost: [{ code: CurrencyCode.GOLD, amount: 2000 }],
    },
];
