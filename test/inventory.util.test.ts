import assert from "node:assert/strict";
import { generateEntityId } from "@/core/entities/base.entity.js";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import type { InventoryItem } from "@/modules/player/schemas/inventory.schema.js";
import {
    addToInventory,
    countItem,
    freeSlotCount,
    moveInventorySlot,
    removeFromInventory,
} from "@/modules/player/utils/inventory.util.js";
import { debitWallet } from "@/modules/player/utils/player-progress.util.js";
import { createWallet } from "@/modules/player/schemas/wallet.schema.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";

const stone = { id: generateEntityId(), stackable: true, maxStack: 9999 };
const sword = { id: generateEntityId(), stackable: false, maxStack: 1 };
const init = { source: ItemSource.DROP };

describe("inventory.util", () => {
    it("dồn vào stack có sẵn tới maxStack rồi mới mở ô mới", () => {
        const inventory: InventoryItem[] = [];
        addToInventory(inventory, 10, stone, 9000, init);
        const result = addToInventory(inventory, 10, stone, 2000, init);
        assert.deepEqual(result, { added: 2000, overflow: 0 });
        assert.deepEqual(
            inventory.map((entry) => entry.quantity),
            [9999, 1001]
        );
        assert.equal(countItem(inventory, stone.id), 11000);
    });

    it("túi đầy → phần dư là overflow", () => {
        const inventory: InventoryItem[] = [];
        const result = addToInventory(inventory, 3, sword, 5, init);
        assert.deepEqual(result, { added: 3, overflow: 2 });
        assert.equal(freeSlotCount(inventory, 3), 0);
        assert.equal(new Set(inventory.map((entry) => entry.id)).size, 3);
    });

    it("bớt item: không đủ thì không bớt gì, đủ thì xoá ô rỗng", () => {
        const inventory: InventoryItem[] = [];
        addToInventory(inventory, 10, stone, 30, init);
        assert.equal(removeFromInventory(inventory, stone.id, 31), false);
        assert.equal(countItem(inventory, stone.id), 30);
        assert.equal(removeFromInventory(inventory, stone.id, 30), true);
        assert.equal(inventory.length, 0);
    });

    it("đổi chỗ 2 ô", () => {
        const inventory: InventoryItem[] = [];
        addToInventory(inventory, 10, sword, 2, init);
        assert.equal(moveInventorySlot(inventory, 10, 0, 1), undefined);
        assert.deepEqual(
            inventory.map((entry) => entry.slotIndex),
            [1, 0]
        );
        assert.equal(moveInventorySlot(inventory, 10, 5, 1), "Slot is empty");
    });

    it("trừ vàng: không đủ thì trả undefined", () => {
        const wallet = createWallet();
        wallet[CurrencyCode.GOLD].balance = 100;
        assert.equal(debitWallet(wallet, [{ code: CurrencyCode.GOLD, amount: 101 }]), undefined);
        const next = debitWallet(wallet, [{ code: CurrencyCode.GOLD, amount: 40 }]);
        assert.equal(next?.[CurrencyCode.GOLD].balance, 60);
        assert.equal(next?.[CurrencyCode.GOLD].totalSpent, 40);
        assert.equal(wallet[CurrencyCode.GOLD].balance, 100);
    });
});
