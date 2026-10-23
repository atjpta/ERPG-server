import type { ItemRarity, ItemSource, ItemType } from "@/modules/items/enums/item.enum.js";
import type { StatKey, StatType } from "@/modules/player/enums/stat.enum.js";

/** 1 dòng chỉ số (StatBonus). */
export interface StatLineMessage {
    stat: StatKey;
    type: StatType;
    value: number;
}

/** Chỉ số của 1 trang bị (ItemEquipmentInstanceMetadata) — main stats là giá trị roll gốc. */
export interface EquipmentInstanceMessage {
    level: number;
    rarity: ItemRarity;
    enhanceLevel: number;
    refineLevel: number;
    mainStats: StatLineMessage[];
    /** `mainStats` sau khi nhân hệ số cường hoá/tinh hoá — giá trị thật đang cộng cho player (message `inventory`). */
    finalMainStats?: StatLineMessage[];
    subStats: StatLineMessage[];
    rarityStats: StatLineMessage[];
}

export interface EquippedItemMessage {
    id: string;
    itemId: string;
    code: string;
    type: ItemType;
    rarity: ItemRarity;
    source: ItemSource;
    isLocked: boolean;
    metadata: EquipmentInstanceMessage;
}

/** Đồ đang mặc theo slot (ItemEquipmentSlotType); slot trống = null. */
export interface EquipmentsMessage {
    main_hand?: EquippedItemMessage;
    off_hand?: EquippedItemMessage;
    head?: EquippedItemMessage;
    armor?: EquippedItemMessage;
    shoulder?: EquippedItemMessage;
    gloves?: EquippedItemMessage;
    boots?: EquippedItemMessage;
    belt?: EquippedItemMessage;
    necklace?: EquippedItemMessage;
    earring_1?: EquippedItemMessage;
    earring_2?: EquippedItemMessage;
    ring_1?: EquippedItemMessage;
    ring_2?: EquippedItemMessage;
    back?: EquippedItemMessage;
}
