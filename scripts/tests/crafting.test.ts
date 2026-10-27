import { Response } from "@/core/response/response.js";
import { RecipeCode } from "@/modules/crafting/enums/recipe-code.enum.js";
import { RecipeGroupCode } from "@/modules/crafting/enums/recipe-group-code.enum.js";
import { RecipeDefinitionSchema } from "@/modules/crafting/schemas/recipe.schema.js";
import { craftingService } from "@/modules/crafting/services/crafting.service.js";
import { recipeService } from "@/modules/crafting/services/recipe.service.js";
import { ItemCode } from "@/modules/items/enums/item-code.enum.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { ItemRarity, ItemType } from "@/modules/items/enums/item.enum.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import { newItemInstanceId, type Inventories } from "@/modules/player/schemas/inventory.schema.js";
import { createWallet, type Wallet } from "@/modules/player/schemas/wallet.schema.js";
import { InventoryState } from "@/modules/player/state/inventory.state.js";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import { check, checkEqual, test } from "./harness.js";

const emptyBag = (): InventoryState =>
    new InventoryState({
        [ItemType.EQUIPMENT]: [],
        [ItemType.CONSUMABLE]: [],
        [ItemType.MATERIAL]: [],
    } as Inventories);

const gold = (amount: number): Wallet => {
    const wallet = createWallet();
    wallet[CurrencyCode.GOLD] = { balance: amount, totalEarned: amount, totalSpent: 0 };
    return wallet;
};

const item = (code: ItemCode) => {
    const found = itemService.getByCode(code);
    check(found, `item ${code} is seeded`);
    return found;
};

const give = (bag: InventoryState, code: ItemCode, quantity: number) => {
    const found = item(code);
    bag.add(found.type, found, quantity, { source: ItemSource.SYSTEM });
};

const recipe = (code: RecipeCode) => {
    const found = recipeService.getByCode(code);
    check(found, `recipe ${code} is seeded`);
    return found;
};

const errorCode = (response: Response<unknown>) =>
    Response.isError(response) ? response.errorCode : null;

const countOf = (bag: InventoryState, code: ItemCode) => bag.countByCode(code);

test("crafting: item xếp chồng — trừ nguyên liệu + tiền, nhân theo quantity", async () => {
    const bag = emptyBag();
    give(bag, ItemCode.SPIRIT, 3);
    const result = craftingService.craft({
        bag,
        wallet: gold(500),
        level: 1,
        recipe: recipe(RecipeCode.CRAFT_HP_POTION_SMALL),
        quantity: 2,
    });
    check(result.success, `expected success, got ${JSON.stringify(result)}`);
    checkEqual(countOf(bag, ItemCode.SPIRIT), 1, "spirit left (2 used)");
    checkEqual(countOf(bag, ItemCode.HP_POTION_SMALL), 10, "5 potions per craft x 2");
    checkEqual(result.data.wallet[CurrencyCode.GOLD].balance, 400, "50 gold per craft x 2");
    checkEqual(result.data.wallet[CurrencyCode.GOLD].totalSpent, 100, "totalSpent");
});

test("crafting: thiếu nguyên liệu / thiếu tiền / thiếu level → lỗi và không đổi gì", async () => {
    const hp = recipe(RecipeCode.CRAFT_HP_POTION_SMALL);

    const noMaterial = emptyBag();
    const wallet = gold(500);
    checkEqual(
        errorCode(
            craftingService.craft({ bag: noMaterial, wallet, level: 1, recipe: hp, quantity: 1 })
        ),
        ItemErrorCode.ITEM_NOT_ENOUGH,
        "no spirit"
    );
    checkEqual(wallet[CurrencyCode.GOLD].balance, 500, "wallet untouched");

    const noGold = emptyBag();
    give(noGold, ItemCode.SPIRIT, 1);
    checkEqual(
        errorCode(
            craftingService.craft({
                bag: noGold,
                wallet: gold(10),
                level: 1,
                recipe: hp,
                quantity: 1,
            })
        ),
        ItemErrorCode.CURRENCY_NOT_ENOUGH,
        "not enough gold"
    );
    checkEqual(countOf(noGold, ItemCode.SPIRIT), 1, "ingredients kept when the fee fails");

    const sword = recipe(RecipeCode.CRAFT_SLIME_SWORDSMAN_MAIN_HAND);
    const lowLevel = emptyBag();
    give(lowLevel, ItemCode.DUST_WEAPON, 10);
    give(lowLevel, ItemCode.SPIRIT, 2);
    checkEqual(
        errorCode(
            craftingService.craft({
                bag: lowLevel,
                wallet: gold(9999),
                level: 1,
                recipe: sword,
                quantity: 1,
            })
        ),
        PlayerErrorCode.LEVEL_TOO_LOW,
        "requiredLevel"
    );
    checkEqual(
        countOf(lowLevel, ItemCode.DUST_WEAPON),
        10,
        "ingredients kept when the level is too low"
    );
});

test("crafting: trang bị có metadata nhúng — chỉ số cố định, mỗi món một bản sao riêng", async () => {
    const fixed = recipe(RecipeCode.CRAFT_SLIME_SWORDSMAN_MAIN_HAND_FIXED);
    check(fixed.resultMetadata, "the fixed recipe carries metadata");
    const bag = emptyBag();
    give(bag, ItemCode.DUST_WEAPON, 40);
    give(bag, ItemCode.ENHANCE_STONE_2, 6);
    const result = craftingService.craft({
        bag,
        wallet: gold(10_000),
        level: 10,
        recipe: fixed,
        quantity: 2,
    });
    check(result.success, `expected success, got ${JSON.stringify(result)}`);
    const swords = bag.bag(ItemType.EQUIPMENT);
    checkEqual(swords.length, 2, "two separate equipment entries");
    for (const sword of swords) {
        checkEqual(sword.itemId, item(ItemCode.SLIME_SWORDSMAN_MAIN_HAND).id, "result item");
        checkEqual(sword.source, ItemSource.CRAFT, "source");
        checkEqual(sword.metadata, fixed.resultMetadata, "fixed stats are copied exactly");
    }
    // Sửa một món không đụng món kia hay công thức.
    (swords[0].metadata as ItemEquipmentInstanceMetadata).enhanceLevel = 5;
    checkEqual(
        (swords[1].metadata as ItemEquipmentInstanceMetadata).enhanceLevel,
        0,
        "independent copies"
    );
    checkEqual(fixed.resultMetadata!.enhanceLevel, 0, "recipe metadata untouched");
});

test("crafting: trang bị không có metadata — roll theo resultLevel / resultRarity", async () => {
    const rolled = recipe(RecipeCode.CRAFT_SLIME_SWORDSMAN_MAIN_HAND);
    check(!rolled.resultMetadata, "no fixed metadata");
    const make = () => {
        const bag = emptyBag();
        give(bag, ItemCode.DUST_WEAPON, 10);
        give(bag, ItemCode.SPIRIT, 2);
        let seed = 1;
        const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const result = craftingService.craft({
            bag,
            wallet: gold(1000),
            level: 10,
            recipe: rolled,
            quantity: 1,
            rng,
        });
        check(result.success, `expected success, got ${JSON.stringify(result)}`);
        return bag.bag(ItemType.EQUIPMENT)[0].metadata as ItemEquipmentInstanceMetadata;
    };
    const first = make();
    checkEqual(
        [first.level, first.rarity],
        [10, ItemRarity.GOOD],
        "level + rarity from the recipe"
    );
    check(first.mainStats.length > 0, "main stats rolled");
    checkEqual(make(), first, "same rng → same roll");
});

test("crafting: túi đầy → INVENTORY_FULL (chỉ chạy trong bản nháp của transact)", async () => {
    const fixed = recipe(RecipeCode.CRAFT_SLIME_SWORDSMAN_MAIN_HAND_FIXED);
    const bag = emptyBag();
    give(bag, ItemCode.DUST_WEAPON, 20);
    give(bag, ItemCode.ENHANCE_STONE_2, 3);
    const sword = item(ItemCode.SLIME_SWORDSMAN_MAIN_HAND);
    for (let slot = 0; slot < InventoryState.sizeOf(ItemType.EQUIPMENT); slot++) {
        bag.bag(ItemType.EQUIPMENT).push({
            id: newItemInstanceId(),
            itemId: sword.id,
            slotIndex: slot,
            quantity: 1,
            source: ItemSource.SYSTEM,
            isLocked: false,
            metadata: {},
        });
    }
    checkEqual(
        errorCode(
            craftingService.craft({
                bag,
                wallet: gold(10_000),
                level: 10,
                recipe: fixed,
                quantity: 1,
            })
        ),
        ItemErrorCode.INVENTORY_FULL,
        "equipment bag is full"
    );
});

test("crafting: nhóm — công thức thuộc nhiều nhóm, NPC chỉ chế nhóm mình giữ", async () => {
    const stone = recipe(RecipeCode.CRAFT_ENHANCE_STONE_2);
    check(recipeService.isOffered(stone, [RecipeGroupCode.SMITHING]), "smithing offers it");
    check(recipeService.isOffered(stone, [RecipeGroupCode.ALCHEMY]), "alchemy offers it too");
    const hp = recipe(RecipeCode.CRAFT_HP_POTION_SMALL);
    check(
        !recipeService.isOffered(hp, [RecipeGroupCode.SMITHING]),
        "smithing does not offer potions"
    );
    check(recipeService.groupExists(RecipeGroupCode.ALCHEMY), "group cached");
    checkEqual(
        recipeService.listByGroup(RecipeGroupCode.SMITHING).map((r) => r.code),
        [
            RecipeCode.CRAFT_SLIME_SWORDSMAN_MAIN_HAND,
            RecipeCode.CRAFT_SLIME_SWORDSMAN_MAIN_HAND_FIXED,
            RecipeCode.CRAFT_ENHANCE_STONE_2,
        ],
        "recipes of a group, in display order"
    );
});

test("crafting: schema công thức từ chối order / item trùng và metadata lẫn roll", async () => {
    const base = {
        groupCodes: ["alchemy"],
        resultItemCode: ItemCode.HP_POTION_SMALL,
        ingredients: [{ itemCode: ItemCode.SPIRIT, quantity: 1, order: 0 }],
    };
    check(RecipeDefinitionSchema.safeParse(base).success, "valid");
    check(
        !RecipeDefinitionSchema.safeParse({
            ...base,
            ingredients: [
                ...base.ingredients,
                { itemCode: ItemCode.DUST_WEAPON, quantity: 1, order: 0 },
            ],
        }).success,
        "duplicate order"
    );
    check(
        !RecipeDefinitionSchema.safeParse({
            ...base,
            ingredients: [
                ...base.ingredients,
                { itemCode: ItemCode.SPIRIT, quantity: 2, order: 1 },
            ],
        }).success,
        "duplicate item"
    );
    check(!RecipeDefinitionSchema.safeParse({ ...base, groupCodes: [] }).success, "needs a group");
    check(
        !RecipeDefinitionSchema.safeParse({ ...base, resultLevel: 5 }).success,
        "level without rarity"
    );
    check(
        !RecipeDefinitionSchema.safeParse({
            ...base,
            resultLevel: 5,
            resultRarity: ItemRarity.GOOD,
            resultMetadata: { level: 5, rarity: ItemRarity.GOOD },
        }).success,
        "fixed metadata and rolled stats are exclusive"
    );
});
