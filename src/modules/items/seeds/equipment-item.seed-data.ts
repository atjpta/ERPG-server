import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import { STARTER_CLASS_CODES } from "@/modules/classes/constants/class.constant.js";
import { equipmentCodeService } from "@/modules/equipment/services/equipment-code.service.js";
import type { NewItem } from "@/modules/items/entities/item.entity.js";
import {
    EQUIPMENT_GROUP_BY_TYPE,
    EquipmentGroup,
    ItemEquipmentType,
} from "@/modules/items/enums/item-equipment.enum.js";
import { ItemRarity, ItemType } from "@/modules/items/enums/item.enum.js";
import type { EquipmentMetadata } from "@/modules/items/schemas/item-metadata.schema.js";

const equipment = (
    biome: Biome,
    classCode: string | null,
    equipmentType: ItemEquipmentType
): NewItem => {
    const metadata: EquipmentMetadata = { equipmentType, biome, classCode };
    return {
        code: equipmentCodeService.equipmentItemCode(biome, classCode, equipmentType),
        type: ItemType.EQUIPMENT,
        rarity: ItemRarity.COMMON,
        requiredLevel: 1,
        stackable: false,
        maxStack: 1,
        sellPrice: biome === Biome.STARTER ? 1 : 10,
        metadata,
    };
};

const ALL_TYPES = Object.values(ItemEquipmentType);
const isWeapon = (type: ItemEquipmentType) =>
    EQUIPMENT_GROUP_BY_TYPE[type] === EquipmentGroup.WEAPON;

/** Đồ tân thủ: giáp + trang sức dùng chung mọi class, vũ khí riêng từng class. */
export const STARTER_EQUIPMENT_ITEMS: NewItem[] = [
    ...ALL_TYPES.filter((type) => !isWeapon(type)).map((type) =>
        equipment(Biome.STARTER, null, type)
    ),
    ...STARTER_CLASS_CODES.flatMap((classCode) =>
        ALL_TYPES.filter(isWeapon).map((type) => equipment(Biome.STARTER, classCode, type))
    ),
];

/** Đồ biome: mỗi biome 1 bộ đủ 12 loại cho từng class. */
export const BIOME_EQUIPMENT_ITEMS: NewItem[] = [
    Biome.SLIME,
    Biome.WEREWOLF,
    Biome.WEREBEAR,
].flatMap((biome) =>
    STARTER_CLASS_CODES.flatMap((classCode) =>
        ALL_TYPES.map((type) => equipment(biome, classCode, type))
    )
);
