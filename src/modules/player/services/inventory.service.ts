import type { ErrorCode } from "@/core/types/result.type.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { ItemSource, type ItemType } from "@/modules/items/enums/item.enum.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import type { ItemReward } from "@/modules/rewards/types/reward.type.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import {
    newItemInstanceId,
    type Inventories,
    type InventoryItem,
} from "@/modules/player/schemas/inventory.schema.js";

/** Phần thông tin item (catalog) cần để xếp vào túi. */
export interface StackInfo {
    id: string;
    stackable: boolean;
    maxStack: number;
}

export interface AddToInventoryResult {
    added: number;
    /** Số lượng không xếp được vì túi đầy. */
    overflow: number;
}

/** Item không còn chỗ trong túi (bị mất) và các loại túi vừa được cộng — để báo client sau khi lưu xong. */
export interface GrantOutcome {
    lostByType: Map<ItemType, ItemReward[]>;
    touched: Set<ItemType>;
}

export class InventoryService {
    /** Sức chứa túi theo loại item (master data `player_config`). */
    inventorySize(type: ItemType): number {
        return masterDataCacheService.get(MasterDataKey.PLAYER_CONFIG).inventorySize[type];
    }

    /** Số item (theo code) player đang có — 0 nếu code không có trong catalog. */
    countByCode(inventories: Inventories, itemCode: string): number {
        const item = itemService.getByCode(itemCode);
        return item ? this.countItem(inventories[item.type], item.id) : 0;
    }

    /** Trừ item theo code; `false` (không đổi gì) nếu không đủ. */
    takeByCode(inventories: Inventories, itemCode: string, quantity: number): boolean {
        const item = itemService.getByCode(itemCode);
        return !!item && this.removeFromInventory(inventories[item.type], item.id, quantity);
    }

    /** Túi có đủ chỗ nhận hết `items` không (tính thử trên bản sao — không đổi túi thật). */
    canFit(inventories: Inventories, items: readonly ItemReward[]): boolean {
        const trial = new Map<ItemType, InventoryItem[]>();
        for (const reward of items) {
            const item = itemService.getById(reward.itemId);
            if (!item) continue;
            const bag = trial.get(item.type) ?? structuredClone(inventories[item.type]);
            trial.set(item.type, bag);
            const { overflow } = this.addToInventory(
                bag,
                this.inventorySize(item.type),
                item,
                reward.quantity,
                { source: ItemSource.QUEST, metadata: reward.metadata }
            );
            if (overflow > 0) return false;
        }
        return true;
    }

    /** Cộng item (thưởng, rơi đồ...) vào đúng túi theo ItemType; phần không còn chỗ bị mất (có trong kết quả). */
    grantItems(
        inventories: Inventories,
        items: readonly ItemReward[],
        source: ItemSource = ItemSource.DROP
    ): GrantOutcome {
        const outcome: GrantOutcome = { lostByType: new Map(), touched: new Set() };
        for (const reward of items) {
            const item = itemService.getById(reward.itemId);
            if (!item) continue;
            outcome.touched.add(item.type);
            const { overflow } = this.addToInventory(
                inventories[item.type],
                this.inventorySize(item.type),
                item,
                reward.quantity,
                { source, metadata: reward.metadata }
            );
            if (overflow > 0) {
                const lost = outcome.lostByType.get(item.type) ?? [];
                lost.push({ ...reward, quantity: overflow });
                outcome.lostByType.set(item.type, lost);
            }
        }
        return outcome;
    }

    /** Các ô trống (0 → size − 1) theo thứ tự tăng dần. */
    freeSlotIndexes(inventory: readonly InventoryItem[], size: number): number[] {
        const used = new Set(inventory.map((entry) => entry.slotIndex));
        const free: number[] = [];
        for (let slot = 0; slot < size; slot++) if (!used.has(slot)) free.push(slot);
        return free;
    }

    freeSlotCount(inventory: readonly InventoryItem[], size: number) {
        return this.freeSlotIndexes(inventory, size).length;
    }

    countItem(inventory: readonly InventoryItem[], itemId: string) {
        return inventory.reduce(
            (sum, entry) => (entry.itemId === itemId ? sum + entry.quantity : sum),
            0
        );
    }

    /**
     * Thêm `quantity` item vào túi (sửa trực tiếp mảng): item stack được thì dồn vào các ô sẵn có tới
     * `maxStack` trước, rồi mới mở ô trống. Không còn ô → phần còn lại là `overflow`.
     */
    addToInventory(
        inventory: InventoryItem[],
        size: number,
        item: StackInfo,
        quantity: number,
        init: {
            source: ItemSource;
            metadata?: ItemEquipmentInstanceMetadata | Record<string, unknown>;
        }
    ): AddToInventoryResult {
        let remaining = Math.max(0, Math.floor(quantity));
        const maxStack = item.stackable ? Math.max(1, item.maxStack) : 1;
        if (item.stackable) {
            for (const entry of inventory) {
                if (remaining === 0) break;
                if (entry.itemId !== item.id || entry.quantity >= maxStack) continue;
                const moved = Math.min(remaining, maxStack - entry.quantity);
                entry.quantity += moved;
                remaining -= moved;
            }
        }
        for (const slotIndex of this.freeSlotIndexes(inventory, size)) {
            if (remaining === 0) break;
            const moved = Math.min(remaining, maxStack);
            inventory.push({
                id: newItemInstanceId(),
                itemId: item.id,
                slotIndex,
                quantity: moved,
                source: init.source,
                isLocked: false,
                metadata: structuredClone(init.metadata ?? {}),
            });
            remaining -= moved;
        }
        return { added: Math.floor(quantity) - remaining, overflow: remaining };
    }

    /**
     * Bớt `quantity` item khỏi túi (sửa trực tiếp mảng), lấy từ ô có slot lớn nhất trước. Không đủ thì
     * không bớt gì và trả `false`.
     */
    removeFromInventory(inventory: InventoryItem[], itemId: string, quantity: number): boolean {
        if (quantity <= 0) return true;
        if (this.countItem(inventory, itemId) < quantity) return false;
        let remaining = quantity;
        const stacks = inventory
            .filter((entry) => entry.itemId === itemId)
            .sort((a, b) => b.slotIndex - a.slotIndex);
        for (const entry of stacks) {
            if (remaining === 0) break;
            const taken = Math.min(remaining, entry.quantity);
            entry.quantity -= taken;
            remaining -= taken;
        }
        this.removeEmpty(inventory);
        return true;
    }

    /** Xoá 1 món theo id riêng (trang bị khi mặc/phân rã); trả món đã xoá. */
    takeInstance(inventory: InventoryItem[], instanceId: string): InventoryItem | undefined {
        const index = inventory.findIndex((entry) => entry.id === instanceId);
        if (index < 0) return undefined;
        return inventory.splice(index, 1)[0];
    }

    /** Đổi chỗ / chuyển ô trong cùng túi; lỗi trả về chuỗi. */
    moveInventorySlot(
        inventory: InventoryItem[],
        size: number,
        fromSlot: number,
        toSlot: number
    ): ErrorCode | undefined {
        if (toSlot < 0 || toSlot >= size) return ItemErrorCode.INVENTORY_SLOT_INVALID;
        const from = inventory.find((entry) => entry.slotIndex === fromSlot);
        if (!from) return ItemErrorCode.INVENTORY_SLOT_EMPTY;
        if (fromSlot === toSlot) return undefined;
        const to = inventory.find((entry) => entry.slotIndex === toSlot);
        from.slotIndex = toSlot;
        if (to) to.slotIndex = fromSlot;
        return undefined;
    }

    private removeEmpty(inventory: InventoryItem[]) {
        for (let i = inventory.length - 1; i >= 0; i--) {
            if (inventory[i].quantity <= 0) inventory.splice(i, 1);
        }
    }
}

export const inventoryService = new InventoryService();
