export enum ItemType {
    EQUIPMENT = "equipment",
    CONSUMABLE = "consumable",
    MATERIAL = "material",
}

export enum ItemRarity {
    COMMON = "common",
    GOOD = "good",
    RARE = "rare",
    EPIC = "epic",
    LEGENDARY = "legendary",
}

export enum ItemSource {
    SYSTEM = "system",
    DROP = "drop",
    GACHA = "gacha",
    SHOP = "shop",
    QUEST = "quest",
    CRAFT = "craft",
    MAIL = "mail",
}

/** Loại hiệu ứng khi dùng consumable — xử lý ở `ConsumableWorldService`. */
export enum ConsumableEffectType {
    /** Bình hồi: cộng thẳng HP / MP. */
    RESTORE = "restore",
}
