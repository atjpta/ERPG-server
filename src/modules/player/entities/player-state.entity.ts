import {
    bigint,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    real,
    text,
    timestamp,
    uuid,
} from "drizzle-orm/pg-core";
import { DateTime } from "luxon";
import { GameMaps } from "@/modules/maps/entities/game-map.entity.js";
import { Players } from "@/modules/auth/entities/player.entity.js";
import { Direction } from "@/modules/player/enums/player.enum.js";
import type { FlagValue } from "@/modules/dialogues/schemas/condition.schema.js";
import type { PlayerQuests } from "@/modules/quests/schemas/quest.schema.js";
import type { CollisionBounds } from "@/core/types/collision-bounds.type.js";
import type { OwnedSkill } from "@/modules/skills/schemas/skill-config.schema.js";
import { Classes } from "@/modules/classes/entities/class.entity.js";
import {
    createEquipments,
    type Equipments,
    type InventoryItem,
} from "@/modules/player/schemas/inventory.schema.js";
import { createAttributes, type Attributes } from "@/modules/player/schemas/stat.schema.js";
import { createWallet, type Wallet } from "@/modules/player/schemas/wallet.schema.js";

export const directionEnum = pgEnum("direction", Direction);

/** Trạng thái gameplay có thể thay đổi liên tục và được khôi phục khi player vào game. */
export const PlayerStates = pgTable("player_states", {
    playerId: uuid("player_id")
        .primaryKey()
        .references(() => Players.id, { onDelete: "cascade" }),
    /** Bắt buộc — migration 0007 thêm cột cho phép null, seed gán class, 0008 chuyển NOT NULL. */
    classId: uuid("class_id")
        .notNull()
        .references(() => Classes.id, { onDelete: "restrict" }),
    level: integer("level").notNull().default(1),
    exp: bigint("exp", { mode: "number" }).notNull().default(0),
    mapCode: text("map_code")
        .notNull()
        .references(() => GameMaps.code, { onDelete: "restrict" }),
    x: real("x").notNull(),
    y: real("y").notNull(),
    direction: directionEnum("direction").notNull().default(Direction.DOWN),
    hp: integer("hp").notNull(),
    mp: integer("mp").notNull(),
    hitbox: jsonb("hitbox")
        .$type<CollisionBounds>()
        .notNull()
        .default({ width: 0.44, height: 0.63, offsetX: 0, offsetY: -0.34 }),
    collider: jsonb("collider")
        .$type<CollisionBounds>()
        .notNull()
        .default({ width: 0.34, height: 0.12, offsetX: 0, offsetY: -0.08 }),
    /** Skill của player theo thứ tự; các skill MELEE (theo thứ tự này) là combo đánh thường. */
    skills: jsonb("skills").$type<OwnedSkill[]>().notNull().default([]),
    wallet: jsonb("wallet").$type<Wallet>().notNull().default(createWallet()),
    /** Inventory tách theo ItemType (mỗi loại 1 túi, kích thước ở master data `player_config`). */
    equipmentInventory: jsonb("equipment_inventory").$type<InventoryItem[]>().notNull().default([]),
    consumableInventory: jsonb("consumable_inventory")
        .$type<InventoryItem[]>()
        .notNull()
        .default([]),
    materialInventory: jsonb("material_inventory").$type<InventoryItem[]>().notNull().default([]),
    equipments: jsonb("equipments").$type<Equipments>().notNull().default(createEquipments()),
    /** Điểm attribute / kỹ năng chưa dùng (nhận khi lên level). */
    attributePoints: integer("attribute_points").notNull().default(0),
    skillPoints: integer("skill_points").notNull().default(0),
    /**
     * Điểm attribute player đã tự cộng — chỉ lưu lựa chọn của player. Attribute/stat cuối cùng
     * (class + level + trang bị) tính khi lấy ra, không lưu (xem player-stat.util.ts).
     */
    allocatedAttributes: jsonb("allocated_attributes")
        .$type<Attributes>()
        .notNull()
        .default(createAttributes()),
    /** Cờ trạng thái cốt truyện (set bởi action `set_flag` của dialogue) — key tự đặt trong data. */
    flags: jsonb("flags").$type<Record<string, FlagValue>>().notNull().default({}),
    /** Quest của player theo quest code — lưu cùng checkpoint với túi đồ nên nhận thưởng và hoàn thành quest luôn khớp nhau. */
    quests: jsonb("quests").$type<PlayerQuests>().notNull().default({}),
    revision: integer("revision").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => DateTime.now().toJSDate()),
});

export type PlayerState = typeof PlayerStates.$inferSelect;
export type NewPlayerState = typeof PlayerStates.$inferInsert;
