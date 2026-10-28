import { equipmentMessageService } from "@/modules/equipment/services/equipment-message.service.js";
import type { PlayerState } from "@/modules/player/state/player.state.js";
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
 * player một bản "đã gửi", đặt lúc vào room và mỗi khi client xin snapshot (`getInventory` / `getAttributes`); mọi nơi đổi túi (global hay
 * world) không cần biết gì về việc này.
 */
export class InventoryDeltaGlobalService {
    private readonly sent = new Map<string, SentState>();

    /** Mốc ban đầu lúc vào room (client chưa xin snapshot thì delta tính từ mốc này). */
    reset(playerState: PlayerState): void {
        this.sent.set(playerState.playerId, this.capture(playerState));
    }

    /** Client vừa nhận snapshot túi + đồ mặc hiện tại (`getInventory`). */
    resetInventory(playerState: PlayerState): void {
        const state = this.sent.get(playerState.playerId);
        if (!state) return this.reset(playerState);
        const { entries, equipped } = this.capture(playerState);
        state.entries = entries;
        state.equipped = equipped;
    }

    /** Client vừa nhận snapshot attributes hiện tại (`getAttributes`). */
    resetAttributes(playerState: PlayerState): void {
        const state = this.sent.get(playerState.playerId);
        if (!state) return this.reset(playerState);
        state.attributes = this.capture(playerState).attributes;
    }

    forget(playerId: string): void {
        this.sent.delete(playerId);
    }

    /** Thay đổi so với lần gửi trước (và coi như đã gửi); `null` nếu túi / đồ mặc không đổi. */
    diff(playerState: PlayerState): InventoryChangedMessage | null {
        const before = this.sent.get(playerState.playerId);
        const now = this.capture(playerState);
        this.sent.set(playerState.playerId, now);
        if (!before) return null;

        const upserted: InventoryEntryMessage[] = [];
        const removed: string[] = [];
        const equipments: Record<string, EquippedItemMessage> = {};
        const emptiedSlots: string[] = [];

        const { inventories } = { inventories: playerState.inventories };
        for (const entry of Object.values(inventories).flat()) {
            if (before.entries.get(entry.id) !== now.entries.get(entry.id)) {
                upserted.push(inventoryGlobalService.toEntryMessage(entry));
            }
        }
        for (const id of before.entries.keys()) {
            if (!now.entries.has(id)) removed.push(id);
        }
        for (const [slot, equipped] of Object.entries(playerState.data.equipments)) {
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
    attributesChanged(playerState: PlayerState): boolean {
        const state = this.sent.get(playerState.playerId);
        const attributes = JSON.stringify(playerState.getAttributeSummary());
        if (!state || state.attributes === attributes) return false;
        state.attributes = attributes;
        return true;
    }

    private capture(playerState: PlayerState): SentState {
        const entries = new Map<string, string>();
        for (const entry of Object.values(playerState.inventories).flat()) {
            entries.set(entry.id, JSON.stringify(entry));
        }
        const equipped = new Map<string, string>();
        for (const [slot, item] of Object.entries(playerState.data.equipments)) {
            equipped.set(slot, JSON.stringify(item));
        }
        return {
            entries,
            equipped,
            attributes: JSON.stringify(playerState.getAttributeSummary()),
        };
    }
}

export const inventoryDeltaGlobalService = new InventoryDeltaGlobalService();
