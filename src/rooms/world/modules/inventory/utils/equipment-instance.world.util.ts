import {
    EQUIPMENT_GROUP_BY_TYPE,
    type ItemEquipmentSlotType,
} from "@/modules/items/enums/item-equipment.enum.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import type {
    EquipmentMetadata,
    ItemEquipmentInstanceMetadata,
} from "@/modules/items/schemas/item-metadata.schema.js";
import { itemService } from "@/modules/items/services/item.service.js";
import type { EquippedItem, InventoryItem } from "@/modules/player/schemas/inventory.schema.js";
import type { OwnedEquipment } from "@/rooms/world/modules/inventory/types/inventory.world.type.js";

export function toOwnedEquipment(
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

export function toInventoryEquipment(equipped: EquippedItem, slotIndex: number): InventoryItem {
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
