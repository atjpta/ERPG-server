import type { Result } from "@/core/types/result.type.js";
import type { Item } from "@/modules/items/entities/item.entity.js";
import {
    type EquipmentGroup,
    type ItemEquipmentSlotType,
} from "@/modules/items/enums/item-equipment.enum.js";
import type {
    EquipmentMetadata,
    ItemEquipmentInstanceMetadata,
} from "@/modules/items/schemas/item-metadata.schema.js";
import type { EquippedItem, InventoryItem } from "@/modules/player/schemas/inventory.schema.js";

/** Kết quả một thao tác túi đồ: dữ liệu hoặc `ErrorCode` lỗi. */
export type InventoryResult<T = null> = Result<T>;

/** Một trang bị của player — đang nằm trong túi hoặc đang mặc. */
export interface OwnedEquipment {
    entry: InventoryItem | EquippedItem;
    item: Item;
    template: EquipmentMetadata;
    group: EquipmentGroup;
    metadata: ItemEquipmentInstanceMetadata;
    equippedSlot?: ItemEquipmentSlotType;
}
