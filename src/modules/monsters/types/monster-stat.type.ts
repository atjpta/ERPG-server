import type { ItemRarity } from "@/modules/items/enums/item.enum.js";
import type { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";

/** Loại + độ hiếm của 1 con monster, lấy từ spawn của map (không lưu ở bảng `monsters`). */
export interface MonsterVariant {
    type: MonsterType;
    rarity: ItemRarity;
}
