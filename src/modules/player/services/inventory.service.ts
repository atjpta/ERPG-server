import type { ItemSource } from "@/modules/items/enums/item.enum.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import {
    newItemInstanceId,
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

/** Các ô trống (0 → size − 1) theo thứ tự tăng dần. */
export function freeSlotIndexes(inventory: readonly InventoryItem[], size: number): number[] {
    const used = new Set(inventory.map((entry) => entry.slotIndex));
    const free: number[] = [];
    for (let slot = 0; slot < size; slot++) if (!used.has(slot)) free.push(slot);
    return free;
}

export const freeSlotCount = (inventory: readonly InventoryItem[], size: number) =>
    freeSlotIndexes(inventory, size).length;

export const countItem = (inventory: readonly InventoryItem[], itemId: string) =>
    inventory.reduce((sum, entry) => (entry.itemId === itemId ? sum + entry.quantity : sum), 0);

/**
 * Thêm `quantity` item vào túi (sửa trực tiếp mảng): item stack được thì dồn vào các ô sẵn có tới
 * `maxStack` trước, rồi mới mở ô trống. Không còn ô → phần còn lại là `overflow`.
 */
export function addToInventory(
    inventory: InventoryItem[],
    size: number,
    item: StackInfo,
    quantity: number,
    init: { source: ItemSource; metadata?: ItemEquipmentInstanceMetadata | Record<string, unknown> }
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
    for (const slotIndex of freeSlotIndexes(inventory, size)) {
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
export function removeFromInventory(
    inventory: InventoryItem[],
    itemId: string,
    quantity: number
): boolean {
    if (quantity <= 0) return true;
    if (countItem(inventory, itemId) < quantity) return false;
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
    removeEmpty(inventory);
    return true;
}

/** Xoá 1 món theo id riêng (trang bị khi mặc/phân rã); trả món đã xoá. */
export function takeInstance(
    inventory: InventoryItem[],
    instanceId: string
): InventoryItem | undefined {
    const index = inventory.findIndex((entry) => entry.id === instanceId);
    if (index < 0) return undefined;
    return inventory.splice(index, 1)[0];
}

/** Đổi chỗ / chuyển ô trong cùng túi; lỗi trả về chuỗi. */
export function moveInventorySlot(
    inventory: InventoryItem[],
    size: number,
    fromSlot: number,
    toSlot: number
): string | undefined {
    if (toSlot < 0 || toSlot >= size) return "Invalid target slot";
    const from = inventory.find((entry) => entry.slotIndex === fromSlot);
    if (!from) return "Slot is empty";
    if (fromSlot === toSlot) return undefined;
    const to = inventory.find((entry) => entry.slotIndex === toSlot);
    from.slotIndex = toSlot;
    if (to) to.slotIndex = fromSlot;
    return undefined;
}

function removeEmpty(inventory: InventoryItem[]) {
    for (let i = inventory.length - 1; i >= 0; i--) {
        if (inventory[i].quantity <= 0) inventory.splice(i, 1);
    }
}
