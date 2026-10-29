import { Response } from "@/core/response/response.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { ItemRarity, ItemSource, type ItemType } from "@/modules/items/enums/item.enum.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import {
    newItemInstanceId,
    type Inventories,
    type InventoryItem,
} from "@/modules/player/schemas/inventory.schema.js";
import type {
    AddToInventoryResult,
    GrantOutcome,
    StackInfo,
} from "@/modules/player/types/inventory.type.js";
import type { ItemReward } from "@/modules/rewards/types/reward.type.js";

const RARITY_ORDER = Object.values(ItemRarity);

/**
 * Ba túi của một player (equipment / consumable / material): bọc `Inventories` đã lưu (không đổi dạng lưu) và sửa thẳng trên đó.
 * Chỉ đổi dữ liệu; lưu / báo client là việc của owner (`PlayerStateManager`).
 */
export class InventoryState {
    constructor(readonly bags: Inventories) {}

    /** Sức chứa túi theo loại item (master data `player_config`). */
    static sizeOf(type: ItemType): number {
        return masterDataCacheService.get(MasterDataKey.PLAYER_CONFIG).inventorySize[type];
    }

    bag(type: ItemType): InventoryItem[] {
        return this.bags[type];
    }

    // ---- đọc --------------------------------------------------------------------------------------------------------------------

    /** Số item (theo id) trong túi `type`. */
    count(type: ItemType, itemId: string): number {
        return this.bags[type].reduce(
            (sum, entry) => (entry.itemId === itemId ? sum + entry.quantity : sum),
            0
        );
    }

    /** Số item (theo code) đang có — 0 nếu code không có trong catalog. */
    countByCode(itemCode: string): number {
        const item = itemService.getByCode(itemCode);
        return item ? this.count(item.type, item.id) : 0;
    }

    /** Các ô trống (0 → size − 1) của túi `type`, theo thứ tự tăng dần. */
    freeSlots(type: ItemType): number[] {
        const used = new Set(this.bags[type].map((entry) => entry.slotIndex));
        const free: number[] = [];
        for (let slot = 0; slot < InventoryState.sizeOf(type); slot++) {
            if (!used.has(slot)) free.push(slot);
        }
        return free;
    }

    freeSlotCount(type: ItemType): number {
        return this.freeSlots(type).length;
    }

    /** Túi có đủ chỗ nhận hết `items` không (tính thử trên bản sao — không đổi túi thật). */
    canFit(items: readonly ItemReward[]): boolean {
        const trial = new Map<ItemType, InventoryState>();
        for (const reward of items) {
            const item = itemService.getById(reward.itemId);
            if (!item) continue;
            let copy = trial.get(item.type);
            if (!copy) {
                copy = new InventoryState({
                    ...this.bags,
                    [item.type]: structuredClone(this.bags[item.type]),
                });
                trial.set(item.type, copy);
            }
            const { overflow } = copy.add(item.type, item, reward.quantity, {
                source: ItemSource.QUEST,
                metadata: reward.metadata,
            });
            if (overflow > 0) return false;
        }
        return true;
    }

    // ---- ghi --------------------------------------------------------------------------------------------------------------------

    /**
     * Thêm `quantity` item vào túi `type`: item stack được thì dồn vào các ô sẵn có tới `maxStack` trước, rồi mới mở ô trống.
     * Không còn ô → phần còn lại là `overflow`.
     */
    add(
        type: ItemType,
        item: StackInfo,
        quantity: number,
        init: {
            source: ItemSource;
            metadata?: ItemEquipmentInstanceMetadata | Record<string, unknown>;
        }
    ): AddToInventoryResult {
        const bag = this.bags[type];
        let remaining = Math.max(0, Math.floor(quantity));
        const maxStack = item.stackable ? Math.max(1, item.maxStack) : 1;
        if (item.stackable) {
            for (const entry of bag) {
                if (remaining === 0) break;
                if (entry.itemId !== item.id || entry.quantity >= maxStack) continue;
                const moved = Math.min(remaining, maxStack - entry.quantity);
                entry.quantity += moved;
                remaining -= moved;
            }
        }
        for (const slotIndex of this.freeSlots(type)) {
            if (remaining === 0) break;
            const moved = Math.min(remaining, maxStack);
            bag.push({
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

    /** Cộng item (thưởng, rơi đồ...) vào đúng túi theo ItemType; phần không còn chỗ bị mất (có trong kết quả). */
    grant(items: readonly ItemReward[], source: ItemSource = ItemSource.DROP): GrantOutcome {
        const outcome: GrantOutcome = { lostByType: new Map(), touched: new Set() };
        for (const reward of items) {
            const item = itemService.getById(reward.itemId);
            if (!item) continue;
            outcome.touched.add(item.type);
            const { overflow } = this.add(item.type, item, reward.quantity, {
                source,
                metadata: reward.metadata,
            });
            if (overflow > 0) {
                const lost = outcome.lostByType.get(item.type) ?? [];
                lost.push({ ...reward, quantity: overflow });
                outcome.lostByType.set(item.type, lost);
            }
        }
        return outcome;
    }

    /**
     * Bớt `quantity` item khỏi túi `type`, lấy từ ô có slot lớn nhất trước. Không đủ thì không bớt gì và trả `false`.
     */
    remove(type: ItemType, itemId: string, quantity: number): boolean {
        if (quantity <= 0) return true;
        if (this.count(type, itemId) < quantity) return false;
        const bag = this.bags[type];
        let remaining = quantity;
        const stacks = bag
            .filter((entry) => entry.itemId === itemId)
            .sort((a, b) => b.slotIndex - a.slotIndex);
        for (const entry of stacks) {
            if (remaining === 0) break;
            const taken = Math.min(remaining, entry.quantity);
            entry.quantity -= taken;
            remaining -= taken;
        }
        for (let i = bag.length - 1; i >= 0; i--) {
            if (bag[i].quantity <= 0) bag.splice(i, 1);
        }
        return true;
    }

    /** Trừ item theo code; `false` (không đổi gì) nếu không đủ. */
    takeByCode(itemCode: string, quantity: number): boolean {
        const item = itemService.getByCode(itemCode);
        return !!item && this.remove(item.type, item.id, quantity);
    }

    /** Xoá 1 món theo id riêng (trang bị khi mặc/phân rã); trả món đã xoá. */
    takeInstance(type: ItemType, instanceId: string): InventoryItem | undefined {
        const bag = this.bags[type];
        const index = bag.findIndex((entry) => entry.id === instanceId);
        if (index < 0) return undefined;
        return bag.splice(index, 1)[0];
    }

    /**
     * Sắp xếp túi `type`: gộp các stack cùng item cho đầy tới `maxStack`, rồi xếp liền từ ô 0 theo rarity giảm dần
     * (trang bị lấy rarity của từng món), code item, số lượng giảm dần, id (để kết quả ổn định).
     */
    sortBag(type: ItemType): void {
        const bag = this.bags[type];
        const byItem = new Map<string, InventoryItem[]>();
        for (const entry of [...bag].sort((a, b) => a.slotIndex - b.slotIndex)) {
            const group = byItem.get(entry.itemId) ?? [];
            group.push(entry);
            byItem.set(entry.itemId, group);
        }
        const kept: InventoryItem[] = [];
        for (const [itemId, entries] of byItem) {
            const item = itemService.getById(itemId);
            if (item?.stackable) {
                // Gộp vào các stack đầu; món khoá chỉ gộp với món khoá, tránh mất trạng thái khoá.
                for (const locked of [true, false]) {
                    const group = entries.filter((entry) => entry.isLocked === locked);
                    let total = group.reduce((sum, entry) => sum + entry.quantity, 0);
                    for (const entry of group) {
                        entry.quantity = Math.min(total, Math.max(1, item.maxStack));
                        total -= entry.quantity;
                        if (entry.quantity > 0) kept.push(entry);
                    }
                }
            } else {
                kept.push(...entries);
            }
        }
        const rarityRank = (entry: InventoryItem): number => {
            const metadata = entry.metadata as { rarity?: ItemRarity } | undefined;
            const rarity = metadata?.rarity ?? itemService.getById(entry.itemId)?.rarity;
            return rarity ? RARITY_ORDER.indexOf(rarity) : -1;
        };
        const code = (entry: InventoryItem) => itemService.getById(entry.itemId)?.code ?? "";
        kept.sort(
            (a, b) =>
                rarityRank(b) - rarityRank(a) ||
                code(a).localeCompare(code(b)) ||
                b.quantity - a.quantity ||
                a.id.localeCompare(b.id)
        );
        kept.forEach((entry, index) => (entry.slotIndex = index));
        bag.splice(0, bag.length, ...kept);
    }

    /** Đổi chỗ / chuyển ô trong cùng túi; lỗi trả về mã lỗi. */
    moveSlot(type: ItemType, fromSlot: number, toSlot: number): Response {
        if (toSlot < 0 || toSlot >= InventoryState.sizeOf(type)) {
            return Response.error(ItemErrorCode.INVENTORY_SLOT_INVALID);
        }
        const bag = this.bags[type];
        const from = bag.find((entry) => entry.slotIndex === fromSlot);
        if (!from) return Response.error(ItemErrorCode.INVENTORY_SLOT_EMPTY);
        if (fromSlot === toSlot) return Response.success();
        const to = bag.find((entry) => entry.slotIndex === toSlot);
        from.slotIndex = toSlot;
        if (to) to.slotIndex = fromSlot;
        return Response.success();
    }
}
