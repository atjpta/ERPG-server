import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import type { Attributes, StatBonus, Stats } from "@/modules/player/schemas/stat.schema.js";
import type { OwnedSkill } from "@/modules/skills/schemas/skill-config.schema.js";

/** Class nhân vật (Swordman → chuyển class lên tier sau). */
export const Classes = pgTable("classes", {
    ...baseWithCodeColumns(),
    name: text("name").notNull(),
    tier: integer("tier").notNull().default(1),
    /**
     * Class con trực thuộc (tier + 1) — các hướng chuyển cấp từ class này. 1 class có thể có nhiều
     * hướng và nhiều class cha. Class con mặc được đồ của mọi class cha/ông (không ngược lại).
     */
    nextClassCodes: jsonb("next_class_codes").$type<string[]>().notNull().default([]),
    /** Level cần để chuyển sang một class trong `nextClassCodes`; null = không chuyển được. */
    nextClassRequiredLevel: integer("next_class_required_level"),
    /** Điểm attribute ở level 1 (tổng 25 với class tier 1). */
    baseAttributes: jsonb("base_attributes").$type<Attributes>().notNull(),
    /** Chỉ số nền cố định của class (move_speed, hp_regen...), không tăng theo level. */
    baseStats: jsonb("base_stats").$type<Stats>().notNull().default({}),
    statBonuses: jsonb("stat_bonuses").$type<StatBonus[]>().notNull().default([]),
    /** Skill mặc định của player thuộc class này (các skill MELEE theo thứ tự = combo đánh thường). */
    skills: jsonb("skills").$type<OwnedSkill[]>().notNull().default([]),
});

export type CharacterClass = typeof Classes.$inferSelect;
export type NewCharacterClass = typeof Classes.$inferInsert;
