import type { Item } from "@/modules/items/entities/item.entity.js";
import {
    EQUIPMENT_GROUP_BY_TYPE,
    type EquipmentGroup,
    type ItemEquipmentSlotType,
} from "@/modules/items/enums/item-equipment.enum.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import type {
    EquipmentMetadata,
    ItemEquipmentInstanceMetadata,
} from "@/modules/items/schemas/item-metadata.schema.js";
import { itemService } from "@/modules/items/services/item.service.js";
import type {
    Equipments,
    EquippedItem,
    Inventories,
    InventoryItem,
} from "@/modules/player/schemas/inventory.schema.js";

/**
 * Một trang bị cụ thể của player — đang nằm trong túi hoặc đang mặc. Bọc dòng đã lưu (`entry`, không đổi dạng lưu) cùng catalog
 * của nó (item, template, nhóm); `metadata` là chính metadata của dòng đó.
 */
export class EquipmentInstanceState {
    private constructor(
        readonly entry: InventoryItem | EquippedItem,
        readonly item: Item,
        readonly template: EquipmentMetadata,
        readonly group: EquipmentGroup,
        readonly equippedSlot?: ItemEquipmentSlotType
    ) {}

    get metadata(): ItemEquipmentInstanceMetadata {
        return this.entry.metadata as ItemEquipmentInstanceMetadata;
    }

    /** Dòng trong túi / đang mặc → state; `undefined` nếu item không phải trang bị. */
    static from(
        entry: InventoryItem | EquippedItem,
        equippedSlot?: ItemEquipmentSlotType
    ): EquipmentInstanceState | undefined {
        const item = itemService.getById(entry.itemId);
        if (item?.type !== ItemType.EQUIPMENT) return undefined;
        const template = item.metadata as EquipmentMetadata;
        return new EquipmentInstanceState(
            entry,
            item,
            template,
            EQUIPMENT_GROUP_BY_TYPE[template.equipmentType],
            equippedSlot
        );
    }

    /** Tìm trang bị theo `instanceId` trong túi trang bị hoặc đồ đang mặc. */
    static find(
        inventories: Inventories,
        equipments: Equipments,
        instanceId: string
    ): EquipmentInstanceState | undefined {
        const inBag = inventories[ItemType.EQUIPMENT].find(
            (candidate) => candidate.id === instanceId
        );
        if (inBag) return EquipmentInstanceState.from(inBag);
        for (const [slot, equipped] of Object.entries(equipments)) {
            if (equipped?.id === instanceId) {
                return EquipmentInstanceState.from(equipped, slot as ItemEquipmentSlotType);
            }
        }
        return undefined;
    }

    /** Món trong túi → dạng đang mặc (giữ nguyên id). */
    static toEquipped(entry: InventoryItem): EquippedItem {
        return {
            id: entry.id,
            itemId: entry.itemId,
            source: entry.source,
            isLocked: entry.isLocked,
            metadata: entry.metadata as EquippedItem["metadata"],
        };
    }

    /** Món đang mặc trở về túi ở ô `slotIndex`. */
    static toInventoryItem(equipped: EquippedItem, slotIndex: number): InventoryItem {
        return {
            id: equipped.id,
            itemId: equipped.itemId,
            slotIndex,
            quantity: 1,
            source: equipped.source,
            isLocked: equipped.isLocked,
            metadata: equipped.metadata,
        };
    }
}
