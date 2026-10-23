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

/** Một trang bị của player — đang nằm trong túi hoặc đang mặc. */
export interface OwnedEquipment {
    entry: InventoryItem | EquippedItem;
    item: Item;
    template: EquipmentMetadata;
    group: EquipmentGroup;
    metadata: ItemEquipmentInstanceMetadata;
    equippedSlot?: ItemEquipmentSlotType;
}

/** Tra / đổi dạng một trang bị cụ thể (instance) của player. */
export class EquipmentInstanceService {
    toOwnedEquipment(
        entry: InventoryItem | EquippedItem,
        equippedSlot?: ItemEquipmentSlotType
    ): OwnedEquipment | undefined {
        const item = itemService.getById(entry.itemId);
        if (item?.type !== ItemType.EQUIPMENT) return undefined;
        const template = item.metadata as EquipmentMetadata;
        return {
            entry,
            item,
            template,
            group: EQUIPMENT_GROUP_BY_TYPE[template.equipmentType],
            metadata: entry.metadata as ItemEquipmentInstanceMetadata,
            equippedSlot,
        };
    }

    /** Món đang mặc trở về túi ở ô `slotIndex`. */
    toInventoryEquipment(equipped: EquippedItem, slotIndex: number): InventoryItem {
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

    /** Tìm trang bị theo `instanceId` trong túi trang bị hoặc đồ đang mặc. */
    findOwned(
        inventories: Inventories,
        equipments: Equipments,
        instanceId: string
    ): OwnedEquipment | undefined {
        const inBag = inventories[ItemType.EQUIPMENT].find(
            (candidate) => candidate.id === instanceId
        );
        if (inBag) return this.toOwnedEquipment(inBag);
        for (const [slot, equipped] of Object.entries(equipments)) {
            if (equipped?.id === instanceId) {
                return this.toOwnedEquipment(equipped, slot as ItemEquipmentSlotType);
            }
        }
        return undefined;
    }
}

export const equipmentInstanceService = new EquipmentInstanceService();
