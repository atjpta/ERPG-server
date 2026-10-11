import { z } from "zod";
import { ConditionSchema } from "@/modules/dialogues/schemas/condition.schema.js";
import { RewardSpecSchema } from "@/modules/rewards/schemas/reward-spec.schema.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { MapSpawnKind } from "@/modules/maps/entities/game-map.entity.js";
import { InteractableCode } from "@/modules/maps/enums/interactable-code.enum.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { MonsterType, RANDOM_MONSTER_TYPE } from "@/modules/monsters/enums/monster-type.enum.js";

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

const level = z.number().int().positive();
const LevelRangeSchema = z
    .object({ min: level, max: level })
    .refine((range) => range.min <= range.max, { message: "min must be <= max" });

const MonsterSpawnSchema = z
    .object({
        monsterCode: z.string().min(1),
        count: z.number().int().positive(),
        spawnX: tile,
        spawnY: tile,
        /** Bỏ trống = normal; `random` = roll normal/elite mỗi lần sinh (xem `monster_spawn_config`). */
        type: z.enum([...Object.values(MonsterType), RANDOM_MONSTER_TYPE]).optional(),
        /** Cố định độ hiếm; bỏ trống = random theo `monster_spawn_config`. */
        rarity: z.enum(ItemRarity).optional(),
        /** Khoảng level riêng của spawn; bỏ trống = khoảng của map (`monsterLevel`), rồi level của monster. */
        minLevel: level.optional(),
        maxLevel: level.optional(),
    })
    .refine((spawn) => (spawn.minLevel ?? 0) <= (spawn.maxLevel ?? Infinity), {
        message: "minLevel must be <= maxLevel",
    });

const NpcPlacementSchema = z.object({
    npcCode: z.string().min(1),
    x: tile,
    y: tile,
    direction: z.enum(["left", "right"]).default("right"),
});

const interactableBase = {
    id: idSchema,
    x: tile,
    y: tile,
    radius: z.number().positive().default(1.5),
    /** Diện mạo của vật thể (client lấy prefab theo code này); bỏ trống = vẽ mặc định. */
    code: z.enum(InteractableCode).optional(),
    conditions: z.array(ConditionSchema).optional(),
};

const InteractableSchema = z.discriminatedUnion("type", [
    z.object({
        ...interactableBase,
        type: z.literal("portal"),
        targetMapCode: z.string().min(1),
        targetSpawnId: idSchema,
    }),
    z.object({
        ...interactableBase,
        type: z.literal("gather"),
        reward: RewardSpecSchema,
        respawnSec: z.number().int().positive(),
    }),
    z.object({ ...interactableBase, type: z.literal("sign"), dialogueCode: z.string().min(1) }),
]);

const RectSchema = z.object({
    x: tile,
    y: tile,
    w: z.number().positive(),
    h: z.number().positive(),
});

const DungeonPhaseSchema = z.object({
    id: idSchema,
    delaySec: z.number().int().nonnegative(),
    monsterSpawns: z.array(MonsterSpawnSchema).min(1),
});

const DungeonChamberSchema = z.object({
    id: idSchema,
    bounds: RectSchema,
    entry: z.object({ x: tile, y: tile }),
    phases: z.array(DungeonPhaseSchema).min(1),
    exit: z.object({ x: tile, y: tile, radius: z.number().positive().default(1.5) }).optional(),
    isBoss: z.boolean().optional(),
    clearReward: RewardSpecSchema.optional(),
});

const multiplier = z.number().nonnegative();
const chance = z.number().min(0).max(1);

export const DungeonDropTuningSchema = z.object({
    expMultiplier: multiplier.optional(),
    goldMultiplier: multiplier.optional(),
    dropRateMultiplier: multiplier.optional(),
    equipmentRate: chance.optional(),
    equipmentRarity: z.partialRecord(z.enum(ItemRarity), z.number().nonnegative()).optional(),
    extraItems: z
        .array(
            z
                .object({
                    itemCode: z.string().min(1),
                    min: z.number().int().positive(),
                    max: z.number().int().positive(),
                    rate: chance,
                    bossOnly: z.boolean().optional(),
                })
                .refine((drop) => drop.min <= drop.max, { message: "min must be <= max" })
        )
        .optional(),
});

export const DungeonConfigSchema = z
    .object({
        drops: DungeonDropTuningSchema.optional(),
        maxLevel: level,
        timeLimitSec: z.number().int().positive().optional(),
        chambers: z.array(DungeonChamberSchema).min(1),
        clearReward: RewardSpecSchema.optional(),
    })
    .superRefine((dungeon, ctx) => {
        const ids = new Set<string>();
        dungeon.chambers.forEach((chamber, i) => {
            const at = ["chambers", i];
            if (ids.has(chamber.id)) {
                ctx.addIssue({ code: "custom", path: [...at, "id"], message: "duplicate id" });
            }
            ids.add(chamber.id);
            const isLast = i === dungeon.chambers.length - 1;
            if (isLast !== (chamber.isBoss === true)) {
                ctx.addIssue({
                    code: "custom",
                    path: [...at, "isBoss"],
                    message: "only the last chamber is the boss chamber",
                });
            }
            if (!isLast && !chamber.exit) {
                ctx.addIssue({ code: "custom", path: [...at, "exit"], message: "exit required" });
            }
            if (chamber.phases[0].delaySec !== 0) {
                ctx.addIssue({
                    code: "custom",
                    path: [...at, "phases", 0, "delaySec"],
                    message: "first phase must spawn at 0",
                });
            }
            chamber.phases.forEach((phase, k) => {
                if (k > 0 && phase.delaySec <= chamber.phases[k - 1].delaySec) {
                    ctx.addIssue({
                        code: "custom",
                        path: [...at, "phases", k, "delaySec"],
                        message: "delaySec must increase",
                    });
                }
            });
        });
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
        /** Level tối thiểu để vào map (hiển thị "Lv X+"). */
        minLevel: level.default(1),
        /** Chỉ map `dungeon`: chamber + phase quái. */
        dungeon: DungeonConfigSchema.optional(),
        spawnPoints: z.array(SpawnPointSchema).min(1),
        colliders: z.array(ColliderSchema).default([]),
        /** Khoảng level quái của map: mỗi con sinh ra / hồi sinh roll level trong khoảng này. */
        monsterLevel: LevelRangeSchema.optional(),
        monsterSpawns: z.array(MonsterSpawnSchema).default([]),
        npcs: z.array(NpcPlacementSchema).default([]),
        interactables: z.array(InteractableSchema).default([]),
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
        if ((map.type === MapType.DUNGEON) !== (map.dungeon !== undefined)) {
            ctx.addIssue({
                code: "custom",
                path: ["dungeon"],
                message: "dungeon config is required for (and only for) type=dungeon",
            });
        }
        const interactableIds = new Set<string>();
        for (const [i, it] of map.interactables.entries()) {
            if (interactableIds.has(it.id)) {
                ctx.addIssue({
                    code: "custom",
                    path: ["interactables", i, "id"],
                    message: "duplicate id",
                });
            }
            interactableIds.add(it.id);
            if (it.x > map.width || it.y > map.height) {
                ctx.addIssue({
                    code: "custom",
                    path: ["interactables", i],
                    message: "outside map",
                });
            }
        }
        for (const [i, npc] of map.npcs.entries()) {
            if (npc.x > map.width || npc.y > map.height) {
                ctx.addIssue({ code: "custom", path: ["npcs", i], message: "outside map" });
            }
        }
        for (const [i, c] of map.colliders.entries()) {
            if (c.x + c.w > map.width || c.y + c.h > map.height) {
                ctx.addIssue({ code: "custom", path: ["colliders", i], message: "outside map" });
            }
        }
    });

export type MapFile = z.infer<typeof MapFileSchema>;
