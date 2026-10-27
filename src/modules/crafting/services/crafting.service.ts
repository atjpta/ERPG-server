import { Response } from "@/core/response/response.js";
import type { Recipe } from "@/modules/crafting/entities/recipe.entity.js";
import { equipmentFactoryService } from "@/modules/equipment/services/equipment-factory.service.js";
import type { Rng } from "@/modules/equipment/types/equipment-roll.type.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { ItemSource, ItemType } from "@/modules/items/enums/item.enum.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import type { InventoryState } from "@/modules/player/state/inventory.state.js";
import { WalletState } from "@/modules/player/state/wallet.state.js";
import type { Wallet } from "@/modules/player/schemas/wallet.schema.js";
import type { ItemReward } from "@/modules/rewards/types/reward.type.js";

export interface CraftOutcome {
    /** Ví sau khi trả phí (bản sao — nơi gọi gán lại vào bản nháp). */
    wallet: Wallet;
    /** Những gì đã cộng vào túi. */
    items: ItemReward[];
}

export class CraftingService {
    /**
     * Chế `quantity` lần `recipe`: trả `cost × quantity` rồi trừ nguyên liệu (`ingredient.quantity × quantity`), cộng item tạo ra vào túi
     * (`ItemSource.CRAFT`). Thiếu level / tiền / nguyên liệu thì lỗi mà túi và ví không đổi (kiểm hết trước khi trừ). Chỉ có hết chỗ túi
     * là phát hiện sau khi đã bớt nguyên liệu (cần biết chỗ trống sau khi trừ) nên **nơi gọi phải chạy trong bản nháp của `transact`**:
     * lỗi nào cũng bỏ nguyên bản nháp, không mất gì.
     * Trang bị: có `resultMetadata` thì chỉ số cố định (mỗi món một bản sao riêng), không có thì roll theo `resultLevel` + `resultRarity`.
     */
    craft(params: {
        bag: InventoryState;
        wallet: Wallet;
        level: number;
        recipe: Recipe;
        quantity: number;
        rng?: Rng;
    }): Response<CraftOutcome> {
        const { bag, wallet, level, recipe, quantity, rng } = params;
        if (level < recipe.requiredLevel) return Response.error(PlayerErrorCode.LEVEL_TOO_LOW);

        const resultItem = itemService.getByCode(recipe.resultItemCode);
        if (!resultItem) return Response.error(ItemErrorCode.ITEM_NOT_FOUND);

        // Nguyên liệu: kiểm hết rồi mới trừ (theo `order` để lỗi báo thiếu món đứng trước).
        const ingredients = [...recipe.ingredients].sort((a, b) => a.order - b.order);
        const needs: { type: ItemType; itemId: string; amount: number }[] = [];
        for (const ingredient of ingredients) {
            const item = itemService.getByCode(ingredient.itemCode);
            if (!item) return Response.error(ItemErrorCode.ITEM_NOT_FOUND);
            const amount = ingredient.quantity * quantity;
            if (bag.count(item.type, item.id) < amount) {
                return Response.error(ItemErrorCode.ITEM_NOT_ENOUGH);
            }
            needs.push({ type: item.type, itemId: item.id, amount });
        }

        const paid = structuredClone(wallet);
        const cost = recipe.cost.map(({ code, amount }) => ({ code, amount: amount * quantity }));
        if (!new WalletState(paid).debit(cost)) {
            return Response.error(ItemErrorCode.CURRENCY_NOT_ENOUGH);
        }
        for (const need of needs) bag.remove(need.type, need.itemId, need.amount);

        const items: ItemReward[] = [];
        if (resultItem.type === ItemType.EQUIPMENT) {
            for (let i = 0; i < quantity; i++) {
                const metadata = recipe.resultMetadata
                    ? structuredClone(recipe.resultMetadata)
                    : equipmentFactoryService.createInstance({
                          item: resultItem,
                          level: recipe.resultLevel!,
                          rarity: recipe.resultRarity!,
                          rng,
                      });
                items.push({ itemId: resultItem.id, quantity: 1, metadata });
            }
        } else {
            items.push({ itemId: resultItem.id, quantity: recipe.resultQuantity * quantity });
        }

        // Túi đầy thì lỗi (không để phần dư mất như rơi đồ) — túi đã bớt nguyên liệu nên chỗ trống của chúng được tính.
        if (!bag.canFit(items)) return Response.error(ItemErrorCode.INVENTORY_FULL);
        bag.grant(items, ItemSource.CRAFT);
        return Response.success({ wallet: paid, items });
    }
}

export const craftingService = new CraftingService();
