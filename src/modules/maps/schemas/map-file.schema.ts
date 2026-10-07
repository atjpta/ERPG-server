import { z } from "zod";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { MapSpawnKind } from "@/modules/maps/entities/game-map.entity.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";

const idSchema = z.string().regex(/^[a-z0-9_]+$/);
const tile = z.number().min(0);

const SpawnPointSchema = z.object({
    id: idSchema,
    x: tile,
    y: tile,
    kind: z.enum(MapSpawnKind),
});

const ColliderSchema = z.object({
    x: tile,
    y: tile,
    w: z.number().positive(),
    h: z.number().positive(),
});

const MonsterSpawnSchema = z.object({
    monsterCode: z.string().min(1),
    count: z.number().int().positive(),
    spawnX: tile,
    spawnY: tile,
    type: z.enum(MonsterType).optional(),
    rarity: z.enum(ItemRarity).optional(),
});

/**
 * File `<mapCode>.map.json` — nguồn dữ liệu duy nhất của layout map, do Unity export (xem docs/map-file-format.md).
 * Toạ độ theo tile, gốc trên-trái, y hướng xuống. Tên hiển thị không nằm ở đây: client tra locale theo `map.{code}.name`.
 */
export const MapFileSchema = z
    .object({
        code: z.string().regex(/^[a-z0-9_-]+$/),
        type: z.enum(MapType),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        tileSize: z.number().int().positive().default(16),
        maxPlayersPerChannel: z.number().int().positive().default(100),
        pvpEnabled: z.boolean().default(false),
        spawnPoints: z.array(SpawnPointSchema).min(1),
        colliders: z.array(ColliderSchema).default([]),
        monsterSpawns: z.array(MonsterSpawnSchema).default([]),
    })
    .superRefine((map, ctx) => {
        const ids = new Set<string>();
        for (const [i, point] of map.spawnPoints.entries()) {
            if (ids.has(point.id)) {
                ctx.addIssue({
                    code: "custom",
                    path: ["spawnPoints", i, "id"],
                    message: "duplicate id",
                });
            }
            ids.add(point.id);
            if (point.x > map.width || point.y > map.height) {
                ctx.addIssue({ code: "custom", path: ["spawnPoints", i], message: "outside map" });
            }
        }
        const defaults = map.spawnPoints.filter((p) => p.kind === MapSpawnKind.DEFAULT);
        if (defaults.length !== 1) {
            ctx.addIssue({
                code: "custom",
                path: ["spawnPoints"],
                message: "exactly one spawn point with kind=default is required",
            });
        }
        for (const [i, c] of map.colliders.entries()) {
            if (c.x + c.w > map.width || c.y + c.h > map.height) {
                ctx.addIssue({ code: "custom", path: ["colliders", i], message: "outside map" });
            }
        }
    });

export type MapFile = z.infer<typeof MapFileSchema>;
