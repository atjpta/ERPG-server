import { integer, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import type { CollisionBounds } from "@/core/types/collision-bounds.type.js";
import type { OwnedSkill } from "@/modules/skills/schemas/skill-config.schema.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { itemRarityEnum } from "@/modules/items/entities/item.entity.js";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";
import type { MonsterDrops } from "@/modules/monsters/schemas/monster-drop.schema.js";
import type { Stats } from "@/modules/player/schemas/stat.schema.js";

export const monsterTypeEnum = pgEnum("monster_type", MonsterType);

/** Base combat and movement stats shared by every instance of a monster type. */
export const Monsters = pgTable("monsters", {
    ...baseWithCodeColumns(),
    name: text("name").notNull(),
    level: integer("level").notNull().default(1),
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
    type: monsterTypeEnum("type").notNull().default(MonsterType.NORMAL),
    rarity: itemRarityEnum("rarity").notNull().default(ItemRarity.COMMON),
    /** Chỉ số cố định (cùng bộ StatKey với player, không tính từ attribute/trang bị). */
    stats: jsonb("stats").$type<Stats>().notNull().default({}),
    drops: jsonb("drops")
        .$type<MonsterDrops>()
        .notNull()
        .default({ currency: [], items: [], exp: 0 }),
});

export type Monster = typeof Monsters.$inferSelect;
export type NewMonster = typeof Monsters.$inferInsert;
