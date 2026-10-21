import type { Biome } from "@/modules/biomes/enums/biome.enum.js";
import type { ItemEquipmentType } from "@/modules/items/enums/item-equipment.enum.js";

export class EquipmentCodeService {
    /** Code template trang bị: `{biome}_{classCode | all}_{type}` — vd `orc_swordsman_head`, `starter_all_belt`. */
    equipmentItemCode(biome: Biome, classCode: string | null, equipmentType: ItemEquipmentType) {
        return `${biome}_${classCode ?? "all"}_${equipmentType}`;
    }
}

export const equipmentCodeService = new EquipmentCodeService();
