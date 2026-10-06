import { integer, jsonb, pgEnum, pgTable } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import type { CollisionBounds } from "@/core/types/collision-bounds.type.js";
import type { OwnedSkill } from "@/modules/skills/schemas/skill-config.schema.js";
import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import type { MonsterDrops } from "@/modules/monsters/schemas/monster-drop.schema.js";
import type { Stats } from "@/modules/player/schemas/stat.schema.js";

export const biomeEnum = pgEnum("biome", Biome);

/**
 * Base combat and movement stats shared by every instance of a monster type. Loại (normal/elite/boss)
 * và độ hiếm không lưu ở đây — cấu hình theo từng spawn của map (`game_maps.monsterSpawns`).
 */
export const Monsters = pgTable("monsters", {
    ...baseWithCodeColumns(),
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
    /** Vùng của monster — quyết định bộ trang bị biome rơi ra (`drops.equipment`). */
    biome: biomeEnum("biome").notNull().default(Biome.ORC),
    /**
     * Chỉ số gốc ở mốc level 1 (cùng bộ StatKey với player). Tăng theo level bằng tỉ lệ dùng chung ở
     * master data `monster_level_config` (computeMonsterStats).
     */
    stats: jsonb("stats").$type<Stats>().notNull().default({}),
    drops: jsonb("drops")
        .$type<MonsterDrops>()
        .notNull()
        .default({ currency: [], items: [], exp: 0 }),
});

export type Monster = typeof Monsters.$inferSelect;
export type NewMonster = typeof Monsters.$inferInsert;
