import { z } from "zod";
import { ItemEquipmentSlotType } from "@/modules/items/enums/item-equipment.enum.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import { EquipmentUpgradeAction } from "@/rooms/world/world.message.js";

const slotIndex = z.number().int().nonnegative();

export const EquipItemSchema = z
    .object({ instanceId: z.uuid(), slot: z.enum(ItemEquipmentSlotType).optional() })
    .strict();

export const UnequipItemSchema = z.object({ slot: z.enum(ItemEquipmentSlotType) }).strict();

export const MoveItemSchema = z
    .object({ type: z.enum(ItemType), fromSlot: slotIndex, toSlot: slotIndex })
    .strict();

export const LockItemSchema = z.object({ instanceId: z.uuid(), locked: z.boolean() }).strict();

/** Cường hoá / tinh hoá 1 món. */
export const UpgradeEquipmentSchema = z.object({ instanceId: z.uuid() }).strict();

export const PreviewUpgradeSchema = z
    .object({
        action: z.enum([EquipmentUpgradeAction.ENHANCE, EquipmentUpgradeAction.REFINE]),
        instanceId: z.uuid(),
    })
    .strict();

export const DisassembleItemsSchema = z
    .object({ instanceIds: z.array(z.uuid()).min(1).max(100) })
    .strict();

export type EquipItemPayload = z.infer<typeof EquipItemSchema>;
export type UnequipItemPayload = z.infer<typeof UnequipItemSchema>;
export type MoveItemPayload = z.infer<typeof MoveItemSchema>;
export type LockItemPayload = z.infer<typeof LockItemSchema>;
export type UpgradeEquipmentPayload = z.infer<typeof UpgradeEquipmentSchema>;
export type PreviewUpgradePayload = z.infer<typeof PreviewUpgradeSchema>;
export type DisassembleItemsPayload = z.infer<typeof DisassembleItemsSchema>;
