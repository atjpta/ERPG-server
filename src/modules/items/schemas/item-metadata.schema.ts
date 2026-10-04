import { z } from "zod";
import { ItemEquipmentType } from "@/modules/items/enums/item-equipment.enum.js";
import { ItemRarity, ItemType } from "@/modules/items/enums/item.enum.js";
import { StatKey, StatType } from "@/modules/player/enums/stat.enum.js";
import { StatBonusSchema } from "@/modules/player/schemas/stat.schema.js";

/** Một dòng chỉ số có thể random khi item rơi/được tạo. */
export const StatRollSchema = z.object({
    stat: z.enum(StatKey),
    type: z.enum(StatType),
    min: z.number(),
    max: z.number(),
    /** Trọng số chọn dòng này trong pool (càng lớn càng dễ ra). */
    weight: z.number().positive().default(1),
});

/** Cách random `rarityStats` cho một trang bị: số dòng theo rarity, chọn từ `pool`. */
export const RollConfigSchema = z.object({
    pool: z.array(StatRollSchema).default([]),
    linesByRarity: z.partialRecord(z.enum(ItemRarity), z.number().int().nonnegative()).default({}),
});

/** `items.metadata` khi `type = EQUIPMENT`. */
export const EquipmentMetadataSchema = z.object({
    /** Loại trang bị; slot mặc được: EQUIPMENT_SLOTS_BY_TYPE. */
    equipmentType: z.enum(ItemEquipmentType),
    stats: z.array(StatBonusSchema).default([]),
    rollConfig: RollConfigSchema.optional(),
});

/** Metadata của 1 trang bị cụ thể trong inventory/equipments (khác nhau giữa các bản cùng item). */
export const ItemEquipmentInstanceMetadataSchema = z.object({
    /** Rarity đã roll khi nhận item (drop có bảng rarity riêng); thiếu = rarity gốc của item. */
    rarity: z.enum(ItemRarity).optional(),
    rarityStats: z.array(StatBonusSchema).optional(),
});

/** Item không phải trang bị: chưa có field cố định. */
export const GenericItemMetadataSchema = z.record(z.string(), z.unknown());

export type StatRoll = z.infer<typeof StatRollSchema>;
export type RollConfig = z.infer<typeof RollConfigSchema>;
export type EquipmentMetadata = z.infer<typeof EquipmentMetadataSchema>;
export type ItemEquipmentInstanceMetadata = z.infer<typeof ItemEquipmentInstanceMetadataSchema>;
export type ItemMetadata = EquipmentMetadata | z.infer<typeof GenericItemMetadataSchema>;

/** Validate `items.metadata` theo `items.type`. */
export const parseItemMetadata = (type: ItemType, metadata: unknown): ItemMetadata =>
    type === ItemType.EQUIPMENT
        ? EquipmentMetadataSchema.parse(metadata)
        : GenericItemMetadataSchema.parse(metadata ?? {});
