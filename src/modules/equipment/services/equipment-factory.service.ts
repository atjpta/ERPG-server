import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import { equipmentConfigService } from "@/modules/equipment/services/equipment-config.service.js";
import { equipmentItemCode } from "@/modules/equipment/utils/equipment-code.util.js";
import { rollEquipmentInstance, type Rng } from "@/modules/equipment/utils/equipment-roll.util.js";
import type { Item } from "@/modules/items/entities/item.entity.js";
import {
    EQUIPMENT_GROUP_BY_TYPE,
    EQUIPMENT_SLOTS_BY_TYPE,
    EquipmentGroup,
    ItemEquipmentType,
    STARTER_EQUIPMENT_LEVEL,
} from "@/modules/items/enums/item-equipment.enum.js";
import { ItemRarity, ItemSource, ItemType } from "@/modules/items/enums/item.enum.js";
import type {
    EquipmentMetadata,
    ItemEquipmentInstanceMetadata,
} from "@/modules/items/schemas/item-metadata.schema.js";
import { itemService } from "@/modules/items/services/item.service.js";
import {
    createEquipments,
    newItemInstanceId,
    type Equipments,
} from "@/modules/player/schemas/inventory.schema.js";

/** Tạo trang bị mới (roll chỉ số theo master data `equipment_stat_config`). */
export class EquipmentFactoryService {
    /** Chỉ số cho 1 món của template `item` ở `level`/`rarity`; thiếu bảng stat → throw (lỗi config). */
    createInstance(params: {
        item: Item;
        level: number;
        rarity: ItemRarity;
        rng?: Rng;
    }): ItemEquipmentInstanceMetadata {
        const { item, level, rarity, rng = Math.random } = params;
        if (item.type !== ItemType.EQUIPMENT) throw new Error(`Item ${item.code} is not equipment`);
        const template = item.metadata as EquipmentMetadata;
        const entry = equipmentConfigService.findStatEntry(
            template.classCode,
            template.equipmentType,
            level
        );
        if (!entry) {
            throw new Error(
                `Missing equipment_stat_config entry ${template.classCode ?? "*"}:${template.equipmentType}:${level}`
            );
        }
        return rollEquipmentInstance({
            entry,
            rarity,
            rarityLineCount: equipmentConfigService.stat.rarityLineCount,
            rng,
        });
    }

    /**
     * Bộ đồ tân thủ mặc sẵn cho nhân vật mới: giáp + trang sức dùng chung, vũ khí đúng class; nhẫn
     * và khuyên tai đeo đủ 2 slot.
     */
    createStarterEquipments(classCode: string, rng: Rng = Math.random): Equipments {
        const equipments = createEquipments();
        for (const type of Object.values(ItemEquipmentType)) {
            const isWeapon = EQUIPMENT_GROUP_BY_TYPE[type] === EquipmentGroup.WEAPON;
            const code = equipmentItemCode(Biome.STARTER, isWeapon ? classCode : null, type);
            const item = itemService.getByCode(code);
            if (!item) throw new Error(`Starter equipment "${code}" not found — run yarn seed`);
            for (const slot of EQUIPMENT_SLOTS_BY_TYPE[type]) {
                equipments[slot] = {
                    id: newItemInstanceId(),
                    itemId: item.id,
                    source: ItemSource.SYSTEM,
                    isLocked: false,
                    metadata: this.createInstance({
                        item,
                        level: STARTER_EQUIPMENT_LEVEL,
                        rarity: ItemRarity.COMMON,
                        rng,
                    }),
                };
            }
        }
        return equipments;
    }
}

export const equipmentFactoryService = new EquipmentFactoryService();
