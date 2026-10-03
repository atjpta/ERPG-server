import { boolean, integer, jsonb, pgEnum, pgTable, real } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import { SkillOwnerType, SkillType, TargetType } from "@/modules/skills/enums/skill.enum.js";
import type {
    SkillHitEvent,
    SkillLevelConfig,
} from "@/modules/skills/schemas/skill-config.schema.js";

export const skillTypeEnum = pgEnum("skill_type", SkillType);
export const targetTypeEnum = pgEnum("target_type", TargetType);
export const skillOwnerTypeEnum = pgEnum("skill_owner_type", SkillOwnerType);

/** Skill catalog. Variable level values and ordered hit events are stored as validated JSONB. */
export const Skills = pgTable("skills", {
    ...baseWithCodeColumns(),
    skillType: skillTypeEnum("skill_type").notNull(),
    targetType: targetTypeEnum("target_type").notNull().default(TargetType.NONE),
    castRange: real("cast_range").notNull().default(0),
    castTimeMs: integer("cast_time_ms").notNull().default(0),
    cooldownMs: integer("cooldown_ms").notNull().default(0),
    manaCost: integer("mana_cost").notNull().default(0),
    staminaCost: integer("stamina_cost").notNull().default(0),
    maxLevel: integer("max_level").notNull().default(10),
    levelConfig: jsonb("level_config").$type<SkillLevelConfig[]>().notNull().default([]),
    skillHitEvents: jsonb("skill_hit_events").$type<SkillHitEvent[]>().notNull().default([]),
    enabled: boolean("enabled").notNull().default(true),
});

export type Skill = typeof Skills.$inferSelect;
export type NewSkill = typeof Skills.$inferInsert;
