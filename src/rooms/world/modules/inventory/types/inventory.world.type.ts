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

/** Lỗi nghiệp vụ trả về client (chuỗi) hoặc kết quả. */
export type InventoryResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

/** Một trang bị của player — đang nằm trong túi hoặc đang mặc. */
export interface OwnedEquipment {
    entry: InventoryItem | EquippedItem;
    item: Item;
    template: EquipmentMetadata;
    group: EquipmentGroup;
    metadata: ItemEquipmentInstanceMetadata;
    equippedSlot?: ItemEquipmentSlotType;
}
