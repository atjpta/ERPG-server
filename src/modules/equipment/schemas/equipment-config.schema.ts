import { z } from "zod";
import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import { EquipmentGroup, ItemEquipmentType } from "@/modules/items/enums/item-equipment.enum.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { StatKey, StatType } from "@/modules/player/enums/stat.enum.js";
import { StatBonusSchema } from "@/modules/player/schemas/stat.schema.js";

/** Cấp cường hoá tối đa của hệ thống (legendary). */
export const MAX_ENHANCE_LEVEL = 25;

const rate = z.number().min(0).max(1);
const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();
/** Key object theo số (JSON chỉ có key string): level "1", "10"…, số món "2", "4"… */
const numberKey = z.string().regex(/^[1-9]\d*$/, "key must be a positive integer");
const byLevel = <T extends z.ZodType>(value: T) => z.record(numberKey, value);
const byRarity = <T extends z.ZodType>(value: T) => z.record(z.enum(ItemRarity), value);
const byGroup = <T extends z.ZodType>(value: T) => z.record(z.enum(EquipmentGroup), value);

/** Báo lỗi nếu 2 phần tử trong `entries` trùng key. */
const uniqueBy =
    <T>(toKey: (entry: T) => string) =>
    (config: { entries: T[] }, ctx: z.RefinementCtx) => {
        const seen = new Set<string>();
        config.entries.forEach((entry, index) => {
            const key = toKey(entry);
            if (seen.has(key)) {
                ctx.addIssue({
                    code: "custom",
                    message: `duplicated entry ${key}`,
                    path: ["entries", index],
                });
            }
            seen.add(key);
        });
    };

/** Một dòng chỉ số roll trong khoảng [min, max]. */
export const StatRangeSchema = z
    .object({
        stat: z.enum(StatKey),
        type: z.enum(StatType),
        min: z.number(),
        max: z.number(),
    })
    .refine((range) => range.min <= range.max, { message: "min must be <= max" });

/** Dòng trong pool random (sub/rarity): `weight` càng lớn càng dễ ra. */
export const WeightedStatRangeSchema = z
    .object({
        stat: z.enum(StatKey),
        type: z.enum(StatType),
        min: z.number(),
        max: z.number(),
        weight: z.number().positive(),
    })
    .refine((range) => range.min <= range.max, { message: "min must be <= max" });

/** Chỉ số của 1 loại trang bị, 1 class, ở 1 mốc level. */
export const EquipmentStatEntrySchema = z.object({
    /** `null` = đồ dùng chung mọi class (đồ tân thủ). */
    classCode: z.string().min(1).nullable(),
    equipmentType: z.enum(ItemEquipmentType),
    level: positiveInt,
    /** Dòng chính — luôn có đủ, giá trị roll trong khoảng; tăng theo cường hoá/tinh hoá. */
    main: z.array(StatRangeSchema).min(1),
    /** Dòng phụ — chọn ngẫu nhiên `subLineCount` dòng (không trùng stat). */
    subPool: z.array(WeightedStatRangeSchema),
    subLineCount: nonNegativeInt,
    /** Dòng theo độ hiếm — số dòng = `rarityLineCount[rarity]`, tinh hoá thêm 1 dòng. */
    rarityPool: z.array(WeightedStatRangeSchema),
});

export const EquipmentStatConfigSchema = z
    .object({
        /** Số dòng rarity stats theo rarity (common 1 → legendary 5). */
        rarityLineCount: byRarity(nonNegativeInt),
        entries: z.array(EquipmentStatEntrySchema),
    })
    .superRefine(
        uniqueBy<EquipmentStatEntry>(
            (entry) => `${entry.classCode ?? "*"}:${entry.equipmentType}:${entry.level}`
        )
    );

/** Bonus khi mặc đủ số món cùng biome + class + nhóm + level (khác level không tính chung). */
export const EquipmentSetEntrySchema = z.object({
    biome: z.enum(Biome),
    classCode: z.string().min(1),
    group: z.enum(EquipmentGroup),
    level: positiveInt,
    /** Số món cần ("2", "4", "6") → bonus; đủ nhiều mốc thì cộng dồn các mốc. */
    bonuses: z.record(numberKey, z.array(StatBonusSchema)),
});

export const EquipmentSetConfigSchema = z
    .object({ entries: z.array(EquipmentSetEntrySchema) })
    .superRefine(
        uniqueBy<EquipmentSetEntry>(
            (entry) => `${entry.biome}:${entry.classCode}:${entry.group}:${entry.level}`
        )
    );

/** Chi phí + tỉ lệ cho 1 bậc cường hoá (lên `index + 1`). */
export const EnhanceStepSchema = z.object({
    rate,
    gold: nonNegativeInt,
    /** Đá cường hoá theo bậc (enhance_stone_1 cho +1…+5, …). */
    stoneCode: z.string().min(1),
    stoneQty: nonNegativeInt,
    /** Bụi đúng nhóm của món (`dustCodeByGroup`). */
    dustQty: nonNegativeInt,
    /** Thất bại thì tụt 1 cấp (thấp nhất +0). */
    downgradeOnFail: z.boolean(),
});

export const EquipmentEnhanceConfigSchema = z.object({
    /** Main stats × `mainStatGrowth ^ enhanceLevel`. */
    mainStatGrowth: z.number().positive(),
    /** Cấp tối đa theo rarity hiện tại — muốn cao hơn phải tinh hoá. */
    maxByRarity: byRarity(z.number().int().min(0).max(MAX_ENHANCE_LEVEL)),
    dustCodeByGroup: byGroup(z.string().min(1)),
    /** `steps[i]` = lên +`i + 1`. */
    steps: z.array(EnhanceStepSchema).length(MAX_ENHANCE_LEVEL),
    /** Nhân chi phí (vàng/đá/bụi) theo level đồ; thiếu = 1. */
    levelCostScale: byLevel(z.number().positive()),
});

export const RefineStepSchema = z.object({
    rate,
    gold: nonNegativeInt,
    spiritQty: nonNegativeInt,
});

export const EquipmentRefineConfigSchema = z.object({
    /** Main stats × `mainStatGrowth ^ refineLevel` (nhân riêng, không gộp với cường hoá). */
    mainStatGrowth: z.number().positive(),
    spiritCode: z.string().min(1),
    /** Theo rarity đích (lên good/rare/epic/legendary); thiếu = không tinh hoá lên được. */
    steps: z.partialRecord(z.enum(ItemRarity), RefineStepSchema),
    levelCostScale: byLevel(z.number().positive()),
});

export const EquipmentDisassembleConfigSchema = z.object({
    spiritCode: z.string().min(1),
    dustCodeByGroup: byGroup(z.string().min(1)),
    /** Tinh linh = floor(spiritBase × levelScale × rarityScale × groupScale). */
    spiritBase: z.number().nonnegative(),
    /** Bụi = floor(dustBase × levelScale × enhanceScale[enhanceLevel] × groupScale). */
    dustBase: z.number().nonnegative(),
    levelScale: byLevel(z.number().nonnegative()),
    rarityScale: byRarity(z.number().nonnegative()),
    /** `enhanceScale[k]` cho món đang +k (0 → 25). */
    enhanceScale: z.array(z.number().nonnegative()).length(MAX_ENHANCE_LEVEL + 1),
    groupScale: byGroup(z.number().nonnegative()),
});

export const EquipmentDropConfigSchema = z.object({
    /** Các mốc level đồ biome có thể rơi. */
    levelTiers: z.array(positiveInt).min(1),
    /**
     * Trọng số mốc = max(0, 1 − |level quái − mốc| / levelRange): mốc càng gần level quái càng dễ
     * ra (quái lv 11, range 15: lv10 ≈ 0.93, lv20 = 0.4).
     */
    levelRange: z.number().positive(),
});

export type StatRange = z.infer<typeof StatRangeSchema>;
export type WeightedStatRange = z.infer<typeof WeightedStatRangeSchema>;
export type EquipmentStatEntry = z.infer<typeof EquipmentStatEntrySchema>;
export type EquipmentStatConfig = z.infer<typeof EquipmentStatConfigSchema>;
export type EquipmentSetEntry = z.infer<typeof EquipmentSetEntrySchema>;
export type EquipmentSetConfig = z.infer<typeof EquipmentSetConfigSchema>;
export type EnhanceStep = z.infer<typeof EnhanceStepSchema>;
export type EquipmentEnhanceConfig = z.infer<typeof EquipmentEnhanceConfigSchema>;
export type RefineStep = z.infer<typeof RefineStepSchema>;
export type EquipmentRefineConfig = z.infer<typeof EquipmentRefineConfigSchema>;
export type EquipmentDisassembleConfig = z.infer<typeof EquipmentDisassembleConfigSchema>;
export type EquipmentDropConfig = z.infer<typeof EquipmentDropConfigSchema>;
