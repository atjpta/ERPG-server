/** Vị trí mặc trên người (key của cột `equipments`). */
export enum ItemEquipmentSlotType {
    MAIN_HAND = "main_hand",
    OFF_HAND = "off_hand",

    HEAD = "head",
    ARMOR = "armor",
    SHOULDER = "shoulder",
    GLOVES = "gloves",
    BOOTS = "boots",
    BELT = "belt",

    NECKLACE = "necklace",
    EARRING_1 = "earring_1",
    EARRING_2 = "earring_2",
    RING_1 = "ring_1",
    RING_2 = "ring_2",
    BACK = "back",
}

export const ItemEquipmentSlotTypeWeapon = [
    ItemEquipmentSlotType.MAIN_HAND,
    ItemEquipmentSlotType.OFF_HAND,
];

export const ItemEquipmentSlotTypeArmor = [
    ItemEquipmentSlotType.HEAD,
    ItemEquipmentSlotType.ARMOR,
    ItemEquipmentSlotType.SHOULDER,
    ItemEquipmentSlotType.GLOVES,
    ItemEquipmentSlotType.BOOTS,
    ItemEquipmentSlotType.BELT,
];

export const ItemEquipmentSlotTypeAccessory = [
    ItemEquipmentSlotType.NECKLACE,
    ItemEquipmentSlotType.EARRING_1,
    ItemEquipmentSlotType.EARRING_2,
    ItemEquipmentSlotType.RING_1,
    ItemEquipmentSlotType.RING_2,
    ItemEquipmentSlotType.BACK,
];

/** Loại trang bị của một item — quyết định item mặc được vào những slot nào. */
export enum ItemEquipmentType {
    MAIN_HAND = "main_hand",
    OFF_HAND = "off_hand",
    HEAD = "head",
    ARMOR = "armor",
    SHOULDER = "shoulder",
    GLOVES = "gloves",
    BOOTS = "boots",
    BELT = "belt",
    NECKLACE = "necklace",
    EARRING = "earring",
    RING = "ring",
    BACK = "back",
}

/** Slot mà mỗi loại trang bị mặc được (nhẫn, khuyên tai có 2 slot). */
export const EQUIPMENT_SLOTS_BY_TYPE: Record<ItemEquipmentType, readonly ItemEquipmentSlotType[]> =
    {
        [ItemEquipmentType.MAIN_HAND]: [ItemEquipmentSlotType.MAIN_HAND],
        [ItemEquipmentType.OFF_HAND]: [ItemEquipmentSlotType.OFF_HAND],
        [ItemEquipmentType.HEAD]: [ItemEquipmentSlotType.HEAD],
        [ItemEquipmentType.ARMOR]: [ItemEquipmentSlotType.ARMOR],
        [ItemEquipmentType.SHOULDER]: [ItemEquipmentSlotType.SHOULDER],
        [ItemEquipmentType.GLOVES]: [ItemEquipmentSlotType.GLOVES],
        [ItemEquipmentType.BOOTS]: [ItemEquipmentSlotType.BOOTS],
        [ItemEquipmentType.BELT]: [ItemEquipmentSlotType.BELT],
        [ItemEquipmentType.NECKLACE]: [ItemEquipmentSlotType.NECKLACE],
        [ItemEquipmentType.EARRING]: [
            ItemEquipmentSlotType.EARRING_1,
            ItemEquipmentSlotType.EARRING_2,
        ],
        [ItemEquipmentType.RING]: [ItemEquipmentSlotType.RING_1, ItemEquipmentSlotType.RING_2],
        [ItemEquipmentType.BACK]: [ItemEquipmentSlotType.BACK],
    };
