import { z } from "zod";
import { StatKey, StatType } from "@/modules/player/enums/stat.enum.js";

/** 5 chỉ số gốc player phân phối điểm; các StatKey còn lại là chỉ số dẫn xuất. */
export const ATTRIBUTE_KEYS = [
    StatKey.STRENGTH,
    StatKey.DEXTERITY,
    StatKey.INTELLIGENCE,
    StatKey.VITALITY,
    StatKey.LUCK,
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

/** Cộng chỉ số từ trang bị / class. PERCENT là tỉ lệ 0 → 1 (0.1 = +10%). */
export const StatBonusSchema = z.object({
    stat: z.enum(StatKey),
    type: z.enum(StatType),
    value: z.number(),
});

export type StatBonus = z.infer<typeof StatBonusSchema>;

/** Giá trị theo từng attribute (vd. điểm gốc của class, điểm player đã cộng). */
const attributePoints = z.number().int().nonnegative().default(0);
export const AttributesSchema = z.object({
    [StatKey.STRENGTH]: attributePoints,
    [StatKey.DEXTERITY]: attributePoints,
    [StatKey.INTELLIGENCE]: attributePoints,
    [StatKey.VITALITY]: attributePoints,
    [StatKey.LUCK]: attributePoints,
});

export type Attributes = Record<AttributeKey, number>;

/** Bảng chỉ số đã tính xong (player) hoặc cố định (monster); thiếu key = 0. */
export const StatsSchema = z.partialRecord(z.enum(StatKey), z.number());

export type Stats = Partial<Record<StatKey, number>>;

export const createAttributes = (value = 0): Attributes =>
    Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, value])) as Attributes;
