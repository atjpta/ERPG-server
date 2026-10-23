import type { EquipmentInstanceMessage } from "@/modules/equipment/interfaces/equipment.message.js";
import type { ItemRarity } from "@/modules/items/enums/item.enum.js";

/** Một món trong thưởng / item bị mất khi túi đầy. */
export interface ItemRewardMessage {
    itemId: string;
    /** Catalog display data so newly dropped items can be shown before the inventory update. */
    code?: string;
    rarity?: ItemRarity;
    quantity: number;
    /** Trang bị: chỉ số đã roll (quantity = 1). */
    metadata?: EquipmentInstanceMessage;
}
