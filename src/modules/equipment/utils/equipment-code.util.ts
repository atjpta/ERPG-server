import type { Biome } from "@/modules/biomes/enums/biome.enum.js";
import type { ItemEquipmentType } from "@/modules/items/enums/item-equipment.enum.js";

/** Code template trang bị: `{biome}_{classCode | all}_{type}` — vd `orc_guardian_head`, `starter_all_belt`. */
export const equipmentItemCode = (
    biome: Biome,
    classCode: string | null,
    equipmentType: ItemEquipmentType
) => `${biome}_${classCode ?? "all"}_${equipmentType}`;
