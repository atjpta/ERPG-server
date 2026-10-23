import type { ItemRarity, ItemSource, ItemType } from "@/modules/items/enums/item.enum.js";
import type {
    EquipmentInstanceMessage,
    EquipmentsMessage,
} from "@/rooms/global/modules/player-data/interfaces/player-data.global.message.js";

/** 1 ô trong túi; `metadata` chỉ có với trang bị. */
export interface InventoryEntryMessage {
    id: string;
    itemId: string;
    /** Code của item — client tra tên, mô tả, icon theo code. */
    code: string;
    type: ItemType;
    /** Rarity gốc của item; trang bị lấy rarity của món trong `metadata`. */
    rarity: ItemRarity;
    slotIndex: number;
    quantity: number;
    source: ItemSource;
    isLocked: boolean;
    metadata?: EquipmentInstanceMessage;
    /** Bình hồi máu / mana: lượng hồi mỗi lần dùng (để mô tả item cho đúng). */
    heal?: number;
    mana?: number;
}

/** 3 túi theo ItemType. */
export interface InventoriesMessage {
    equipment: InventoryEntryMessage[];
    consumable: InventoryEntryMessage[];
    material: InventoryEntryMessage[];
}

/** Số ô tối đa của từng túi (master data `player_config.inventorySize`). */
export interface InventorySizesMessage {
    equipment: number;
    consumable: number;
    material: number;
}

export interface InventoryMessage {
    inventories: InventoriesMessage;
    /** Sức chứa từng túi — client vẽ đủ ô, ô trống để nền. */
    sizes: InventorySizesMessage;
    /** Class code của đồ mà player mặc được (class hiện tại + class tier thấp hơn chuyển cấp tới nó); đồ dùng chung luôn mặc được. */
    usableClassCodes: string[];
    equipments: EquipmentsMessage;
}

export interface InventoryNearlyFullMessage {
    type: ItemType;
    freeSlots: number;
}

export interface InventoryFullMessage {
    type: ItemType;
    lostItems: ItemRewardMessage[];
}

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
