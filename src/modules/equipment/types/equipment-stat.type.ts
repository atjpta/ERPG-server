import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import type { EquipmentGroup } from "@/modules/items/enums/item-equipment.enum.js";

export interface MainStatGrowth {
    /** `equipment_enhance_config.mainStatGrowth` (1.05). */
    enhance: number;
    /** `equipment_refine_config.mainStatGrowth` (1.1). */
    refine: number;
}

/** Món đang mặc tính set: cùng biome + class + nhóm + level mới đếm chung. */
export interface SetPiece {
    biome: Biome;
    classCode: string | null;
    group: EquipmentGroup;
    level: number;
}
