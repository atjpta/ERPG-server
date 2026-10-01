import { integer, pgTable, real, text } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";

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
});

export type Monster = typeof Monsters.$inferSelect;
export type NewMonster = typeof Monsters.$inferInsert;
