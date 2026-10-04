import { integer, jsonb, pgTable, real, text } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import type { CollisionBounds } from "@/core/types/collision-bounds.type.js";
import type { OwnedSkill } from "@/modules/skills/schemas/skill-config.schema.js";

/** Base combat and movement stats shared by every instance of a monster type. */
export const Monsters = pgTable("monsters", {
    ...baseWithCodeColumns(),
    name: text("name").notNull(),
    level: integer("level").notNull().default(1),
    maxHp: integer("max_hp").notNull(),
    attack: integer("attack").notNull(),
    defense: integer("defense").notNull().default(0),
    moveSpeed: real("move_speed").notNull(),
    attackRange: real("attack_range").notNull(),
    attackCooldownMs: integer("attack_cooldown_ms").notNull(),
    hitbox: jsonb("hitbox")
        .$type<CollisionBounds>()
        .notNull()
        .default({ width: 0.47, height: 0.56, offsetX: 0, offsetY: -0.3 }),
    collider: jsonb("collider")
        .$type<CollisionBounds>()
        .notNull()
        .default({ width: 0.31, height: 0.12, offsetX: 0, offsetY: -0.08 }),
    /** Skill của monster theo thứ tự; skill MELEE đầu tiên là đòn đánh thường. */
    skills: jsonb("skills").$type<OwnedSkill[]>().notNull().default([]),
});

export type Monster = typeof Monsters.$inferSelect;
export type NewMonster = typeof Monsters.$inferInsert;
