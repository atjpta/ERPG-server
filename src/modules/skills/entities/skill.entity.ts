import { SkillCode } from "@/modules/skills/enums/skill-code.enum.js";
import { boolean, integer, jsonb, pgEnum, pgTable, real } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import { SkillOwnerType, SkillType, TargetType } from "@/modules/skills/enums/skill.enum.js";
import type {
    SkillChargeInput,
    SkillHitEvent,
    SkillLevelConfig,
} from "@/modules/skills/schemas/skill-config.schema.js";

export const skillTypeEnum = pgEnum("skill_type", SkillType);
export const targetTypeEnum = pgEnum("target_type", TargetType);
export const skillOwnerTypeEnum = pgEnum("skill_owner_type", SkillOwnerType);

/** Skill catalog. Variable level values and ordered hit events are stored as validated JSONB. */
export const Skills = pgTable("skills", {
    ...baseWithCodeColumns(SkillCode),
    skillType: skillTypeEnum("skill_type").notNull(),
    targetType: targetTypeEnum("target_type").notNull().default(TargetType.NONE),
    castRange: real("cast_range").notNull().default(0),
    /** Chờ từ lúc bấm đến lúc anim + hit event bắt đầu (khoá di chuyển). */
    castTimeMs: integer("cast_time_ms").notNull().default(0),
    /** Thời gian anim chạy (khoá di chuyển), hit event tính từ lúc anim bắt đầu. */
    animationMs: integer("animation_ms").notNull().default(0),
    cooldownMs: integer("cooldown_ms").notNull().default(0),
    manaCost: integer("mana_cost").notNull().default(0),
    staminaCost: integer("stamina_cost").notNull().default(0),
    maxLevel: integer("max_level").notNull().default(10),
    /** Đòn đánh thường: các skill này trong cột `skills` của player/monster, theo thứ tự, là combo đánh thường. */
    basicAttack: boolean("basic_attack").notNull().default(false),
    levelConfig: jsonb("level_config").$type<SkillLevelConfig[]>().notNull().default([]),
    skillHitEvents: jsonb("skill_hit_events").$type<SkillHitEvent[]>().notNull().default([]),
    /** Chỉ skill lướt tới mục tiêu (`isChargeSkill`): tốc độ, thời gian dư, quãng lướt khi không có mục tiêu. Thiếu field → mặc định. */
    chargeConfig: jsonb("charge_config").$type<SkillChargeInput>(),
});

export type Skill = typeof Skills.$inferSelect;
export type NewSkill = typeof Skills.$inferInsert;
