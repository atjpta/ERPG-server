import { equipmentMessageService } from "@/modules/equipment/services/equipment-message.service.js";
import type { PlayerRuntime } from "@/rooms/runtime/modules/player/runtime/player-runtime.js";
import type { EquippedItemMessage } from "@/rooms/global/modules/player-data/interfaces/player-data.global.message.js";
import type {
    InventoryChangedMessage,
    InventoryEntryMessage,
} from "@/rooms/global/modules/inventory/interfaces/inventory.global.message.js";
import { inventoryGlobalService } from "@/rooms/global/modules/inventory/services/inventory.global.service.js";

/** Những gì client đã biết: JSON của từng ô túi (theo id), từng slot đồ mặc và bản tóm tắt attribute. */
interface SentState {
    entries: Map<string, string>;
    equipped: Map<string, string>;
    attributes: string;
}

/**
 * Tính **chi tiết thay đổi** của túi / đồ đang mặc giữa hai lần gửi để client chỉ nhận phần đổi (`inventoryChanged`) thay vì cả túi. Mỗi
 * player một bản "đã gửi", đặt lúc gửi `inventory` đầy đủ (vào room); mọi nơi đổi túi (global hay world) không cần biết gì về việc này.
 */
export class InventoryDeltaGlobalService {
    private readonly sent = new Map<string, SentState>();

    /** Ghi nhận client vừa nhận trạng thái đầy đủ hiện tại. */
    reset(runtime: PlayerRuntime): void {
        this.sent.set(runtime.playerId, this.capture(runtime));
    }

    forget(playerId: string): void {
        this.sent.delete(playerId);
    }

    /** Thay đổi so với lần gửi trước (và coi như đã gửi); `null` nếu túi / đồ mặc không đổi. */
    diff(runtime: PlayerRuntime): InventoryChangedMessage | null {
        const before = this.sent.get(runtime.playerId);
        const now = this.capture(runtime);
        this.sent.set(runtime.playerId, now);
        if (!before) return null;

        const upserted: InventoryEntryMessage[] = [];
        const removed: string[] = [];
        const equipments: Record<string, EquippedItemMessage> = {};
        const emptiedSlots: string[] = [];

        const { inventories } = { inventories: runtime.inventories };
        for (const entry of Object.values(inventories).flat()) {
            if (before.entries.get(entry.id) !== now.entries.get(entry.id)) {
                upserted.push(inventoryGlobalService.toEntryMessage(entry));
            }
        }
        for (const id of before.entries.keys()) {
            if (!now.entries.has(id)) removed.push(id);
        }
        for (const [slot, equipped] of Object.entries(runtime.data.equipments)) {
            if (before.equipped.get(slot) === now.equipped.get(slot)) continue;
            if (equipped) equipments[slot] = equipmentMessageService.toEquippedMessage(equipped);
            else emptiedSlots.push(slot);
        }

        if (
            upserted.length === 0 &&
            removed.length === 0 &&
            emptiedSlots.length === 0 &&
            Object.keys(equipments).length === 0
        ) {
            return null;
        }
        return { upserted, removed, equipments, emptiedSlots };
    }

    /** Attribute / stats khác lần gửi trước không (và coi như đã gửi). */
    attributesChanged(runtime: PlayerRuntime): boolean {
        const state = this.sent.get(runtime.playerId);
        const attributes = JSON.stringify(runtime.getAttributeSummary());
        if (!state || state.attributes === attributes) return false;
        state.attributes = attributes;
        return true;
    }

    private capture(runtime: PlayerRuntime): SentState {
        const entries = new Map<string, string>();
        for (const entry of Object.values(runtime.inventories).flat()) {
            entries.set(entry.id, JSON.stringify(entry));
        }
        const equipped = new Map<string, string>();
        for (const [slot, item] of Object.entries(runtime.data.equipments)) {
            equipped.set(slot, JSON.stringify(item));
        }
        return {
            entries,
            equipped,
            attributes: JSON.stringify(runtime.getAttributeSummary()),
        };
    }
}

export const inventoryDeltaGlobalService = new InventoryDeltaGlobalService();
