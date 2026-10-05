import { z } from "zod";
import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import { ItemEquipmentType } from "@/modules/items/enums/item-equipment.enum.js";
import { ItemRarity, ItemType } from "@/modules/items/enums/item.enum.js";
import { StatBonusSchema } from "@/modules/player/schemas/stat.schema.js";

/**
 * `items.metadata` khi `type = EQUIPMENT` — chỉ là khuôn (template). Chỉ số của từng món được roll
 * theo master data `equipment_stat_config` khi món đó được tạo (ItemEquipmentInstanceMetadata).
 */
export const EquipmentMetadataSchema = z.object({
    /** Loại trang bị; slot mặc được: EQUIPMENT_SLOTS_BY_TYPE. */
    equipmentType: z.enum(ItemEquipmentType),
    biome: z.enum(Biome),
    /** Class mặc được (class con của nó cũng mặc được); `null` = mọi class. */
    classCode: z.string().min(1).nullable(),
});

/** Metadata của 1 trang bị cụ thể trong inventory/equipments (khác nhau giữa các bản cùng item). */
export const ItemEquipmentInstanceMetadataSchema = z.object({
    /** Level của món (mốc 10/20/…; đồ tân thủ = 1) — cũng là level yêu cầu để mặc. */
    level: z.number().int().positive(),
    rarity: z.enum(ItemRarity),
    /** Cấp cường hoá (+0 → +25), giới hạn theo rarity. */
    enhanceLevel: z.number().int().nonnegative().default(0),
    /** Số lần tinh hoá thành công (mỗi lần +1 rarity, nhân main stats). */
    refineLevel: z.number().int().nonnegative().default(0),
    /** Giá trị roll gốc — chưa nhân hệ số cường hoá/tinh hoá. */
    mainStats: z.array(StatBonusSchema).default([]),
    subStats: z.array(StatBonusSchema).default([]),
    /** Số dòng theo rarity; mỗi lần tinh hoá thêm 1 dòng. */
    rarityStats: z.array(StatBonusSchema).default([]),
});

/** Item không phải trang bị: chưa có field cố định. */
export const GenericItemMetadataSchema = z.record(z.string(), z.unknown());

export type EquipmentMetadata = z.infer<typeof EquipmentMetadataSchema>;
export type ItemEquipmentInstanceMetadata = z.infer<typeof ItemEquipmentInstanceMetadataSchema>;
export type ItemMetadata = EquipmentMetadata | z.infer<typeof GenericItemMetadataSchema>;

/** Validate `items.metadata` theo `items.type`. */
export const parseItemMetadata = (type: ItemType, metadata: unknown): ItemMetadata =>
    type === ItemType.EQUIPMENT
        ? EquipmentMetadataSchema.parse(metadata)
        : GenericItemMetadataSchema.parse(metadata ?? {});
