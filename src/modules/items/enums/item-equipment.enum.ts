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

/** Nhóm trang bị — quyết định set (giáp 6 / trang sức 6 / vũ khí 2) và loại bụi cường hoá. */
export enum EquipmentGroup {
    WEAPON = "weapon",
    ARMOR = "armor",
    ACCESSORY = "accessory",
}

export const EQUIPMENT_GROUP_BY_TYPE: Record<ItemEquipmentType, EquipmentGroup> = {
    [ItemEquipmentType.MAIN_HAND]: EquipmentGroup.WEAPON,
    [ItemEquipmentType.OFF_HAND]: EquipmentGroup.WEAPON,
    [ItemEquipmentType.HEAD]: EquipmentGroup.ARMOR,
    [ItemEquipmentType.ARMOR]: EquipmentGroup.ARMOR,
    [ItemEquipmentType.SHOULDER]: EquipmentGroup.ARMOR,
    [ItemEquipmentType.GLOVES]: EquipmentGroup.ARMOR,
    [ItemEquipmentType.BOOTS]: EquipmentGroup.ARMOR,
    [ItemEquipmentType.BELT]: EquipmentGroup.ARMOR,
    [ItemEquipmentType.NECKLACE]: EquipmentGroup.ACCESSORY,
    [ItemEquipmentType.EARRING]: EquipmentGroup.ACCESSORY,
    [ItemEquipmentType.RING]: EquipmentGroup.ACCESSORY,
    [ItemEquipmentType.BACK]: EquipmentGroup.ACCESSORY,
};

/** Level của đồ tân thủ (đồ biome có level theo mốc trong `equipment_drop_config.levelTiers`). */
export const STARTER_EQUIPMENT_LEVEL = 1;
