import { z } from "zod";
import { generateEntityId } from "@/core/entities/base.entity.js";
import { ItemEquipmentSlotType } from "@/modules/items/enums/item-equipment.enum.js";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import {
    GenericItemMetadataSchema,
    ItemEquipmentInstanceMetadataSchema,
} from "@/modules/items/schemas/item-metadata.schema.js";

/** Một ô trong cột `inventory` của player state. */
export const InventoryItemSchema = z.object({
    /** Id riêng của từng món (uuid v7, newItemInstanceId) — phân biệt các bản cùng item. */
    id: z.uuid(),
    itemId: z.uuid(),
    slotIndex: z.number().int().nonnegative(),
    quantity: z.number().int().positive(),
    source: z.enum(ItemSource),
    isLocked: z.boolean().default(false),
    /** Trang bị: ItemEquipmentInstanceMetadata; item khác: tuỳ loại. */
    metadata: z.union([ItemEquipmentInstanceMetadataSchema, GenericItemMetadataSchema]).default({}),
});

export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export const InventorySchema = z.array(InventoryItemSchema);

/** Trang bị đang mặc ở một slot. */
export const EquippedItemSchema = z.object({
    /** Giữ nguyên id của món khi chuyển giữa inventory và equipments. */
    id: z.uuid(),
    itemId: z.uuid(),
    source: z.enum(ItemSource),
    isLocked: z.boolean().default(false),
    metadata: ItemEquipmentInstanceMetadataSchema.default({}),
});

export type EquippedItem = z.infer<typeof EquippedItemSchema>;

/** Cột `equipments`: mọi slot đều có key, `null` = đang trống. */
export const EquipmentsSchema = z.record(
    z.enum(ItemEquipmentSlotType),
    EquippedItemSchema.nullable()
);

export type Equipments = Record<ItemEquipmentSlotType, EquippedItem | null>;

export const createEquipments = (): Equipments =>
    Object.fromEntries(
        Object.values(ItemEquipmentSlotType).map((slot): [ItemEquipmentSlotType, null] => [
            slot,
            null,
        ])
    ) as Equipments;

/** Id cho một món mới (uuid v7). */
export const newItemInstanceId = generateEntityId;
