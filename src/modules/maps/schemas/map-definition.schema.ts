import { z } from "zod";
import { ConditionSchema } from "@/modules/dialogues/schemas/condition.schema.js";
import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { MapSpawnKind } from "@/modules/maps/entities/game-map.entity.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { GateCode } from "@/modules/maps/enums/gate-code.enum.js";
import { InteractableCode } from "@/modules/maps/enums/interactable-code.enum.js";
import { MonsterType, RANDOM_MONSTER_TYPE } from "@/modules/monsters/enums/monster-type.enum.js";
import { RewardSpecSchema } from "@/modules/rewards/schemas/reward-spec.schema.js";

/**
 * Định nghĩa map phía server (seed / admin): mọi **config** — loại map, level, số người, PvP, quái nào ở
 * marker nào, portal đi đâu, phần thưởng... Unity chỉ đặt **vị trí** cho các marker mà định nghĩa này liệt kê
 * sẵn (xem `map-layout.schema.ts`). Marker nhận diện bằng `id` ổn định.
 */
const idSchema = z.string().regex(/^[a-z0-9_]+$/);
const level = z.number().int().positive();

/** Một loại quái trong nhóm: `count` con, cùng loại / độ hiếm / khoảng level. */
export const MonsterMemberSchema = z
    .object({
        monsterCode: z.string().min(1),
        count: z.number().int().positive(),
        /** Bỏ trống = normal; `random` = roll normal/elite mỗi lần sinh (xem `monster_spawn_config`). */
        type: z.enum([...Object.values(MonsterType), RANDOM_MONSTER_TYPE]).optional(),
        rarity: z.enum(ItemRarity).optional(),
        /** Khoảng level riêng; bỏ trống = `monsterLevel` của map, rồi level gốc của monster. */
        minLevel: level.optional(),
        maxLevel: level.optional(),
    })
    .refine((member) => (member.minLevel ?? 0) <= (member.maxLevel ?? Infinity), {
        message: "minLevel must be <= maxLevel",
    });
export type MonsterMember = z.infer<typeof MonsterMemberSchema>;

/**
 * Nhóm quái đặt tại 1 marker (`markerId`): nhiều loại quái đứng quanh điểm đó (hàng 3 con, căn giữa marker).
 * Unity chỉ đặt vị trí marker.
 */
export const MonsterGroupSchema = z.object({
    markerId: idSchema,
    members: z.array(MonsterMemberSchema).min(1),
});
export type MonsterGroup = z.infer<typeof MonsterGroupSchema>;

const SpawnPointDefSchema = z.object({ id: idSchema, kind: z.enum(MapSpawnKind) });

const NpcSlotSchema = z.object({
    /** Id slot trong map (Unity đặt vị trí theo id này). */
    id: idSchema,
    npcCode: z.string().min(1),
});

const interactableBase = {
    id: idSchema,
    /** Diện mạo để client chọn prefab. */
    code: z.enum(InteractableCode).optional(),
    radius: z.number().positive().default(1.5),
    conditions: z.array(ConditionSchema).optional(),
};

export const InteractableDefSchema = z.discriminatedUnion("type", [
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
    /**
     * Bệ teleport (dịch chuyển nhanh): dùng thì mở danh sách mọi map có bệ teleport, chọn map nào là tới
     * ngay bệ teleport của map đó. Không có đích cố định — map nào có teleport thì là điểm đến.
     */
    z.object({ ...interactableBase, type: z.literal("teleport") }),
]);
export type InteractableDef = z.infer<typeof InteractableDefSchema>;

const DungeonPhaseDefSchema = z.object({
    id: idSchema,
    /** Giây kể từ lúc chamber bắt đầu thì phase spawn (phase đầu = 0). */
    delaySec: z.number().int().nonnegative(),
    groups: z.array(MonsterGroupSchema).min(1),
});

const DungeonChamberDefSchema = z.object({
    id: idSchema,
    isBoss: z.boolean().optional(),
    /** Có cổng exit (sang chamber kế; chamber boss: cổng thoát). Mặc định: có, trừ chamber boss. */
    hasExit: z.boolean().optional(),
    exitRadius: z.number().positive().default(1.5),
    phases: z.array(DungeonPhaseDefSchema).min(1),
});

/**
 * Thưởng khi clear dungeon (hạ boss) cho mỗi người chơi. `exp` / `currency` / `items` là phần cố định; thêm
 * `slots`: mỗi item cố định chiếm 1 slot, mỗi item trong `dropItems` trúng tỉ lệ chiếm thêm 1 slot, `equipment`
 * lấp các slot còn lại (mỗi món roll riêng món + rarity).
 */
export const DungeonClearRewardSchema = RewardSpecSchema.extend({
    slots: z.number().int().positive().optional(),
    /** Item rơi thêm: trúng `rate` thì nhận `min`–`max` cái. */
    dropItems: z
        .array(
            z
                .object({
                    itemCode: z.string().min(1),
                    min: z.number().int().positive(),
                    max: z.number().int().positive(),
                    rate: z.number().min(0).max(1),
                })
                .refine((drop) => drop.min <= drop.max, { message: "min must be <= max" })
        )
        .default([]),
    equipment: z
        .object({
            biome: z.enum(Biome),
            /** Trọng số rarity (không cần tổng = 1); trống = common. */
            rarity: z.partialRecord(z.enum(ItemRarity), z.number().nonnegative()).default({}),
        })
        .optional(),
}).refine(
    (reward) => reward.slots !== undefined || (!reward.equipment && reward.dropItems.length === 0),
    {
        path: ["slots"],
        message: "slots is required with equipment / dropItems",
    }
);

export const DungeonDefSchema = z
    .object({
        /** Level quái = ceil(trung bình level người trong instance), tối đa giá trị này. */
        maxLevel: level,
        timeLimitSec: z.number().int().positive().optional(),
        clearReward: DungeonClearRewardSchema.optional(),
        /** Diện mạo cổng chắn mỗi chamber (client chọn prefab theo code). Bỏ trống = không có cổng. */
        gateCode: z.enum(GateCode).optional(),
        chambers: z.array(DungeonChamberDefSchema).min(1),
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
            if (!isLast && chamber.hasExit === false) {
                ctx.addIssue({
                    code: "custom",
                    path: [...at, "hasExit"],
                    message: "exit required",
                });
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
export type DungeonDef = z.infer<typeof DungeonDefSchema>;

export const MapDefinitionSchema = z
    .object({
        code: z.string().regex(/^[a-z0-9_-]+$/),
        type: z.enum(MapType),
        /** Level tối thiểu để vào map (hiển thị "Lv X+"). */
        minLevel: level.default(1),
        maxPlayersPerChannel: z.number().int().positive().default(100),
        pvpEnabled: z.boolean().default(false),
        /** Khoảng level quái của map (field): mỗi con sinh ra / hồi sinh roll trong khoảng này. */
        monsterLevel: z
            .object({ min: level, max: level })
            .refine((range) => range.min <= range.max, { message: "min must be <= max" })
            .optional(),
        spawnPoints: z.array(SpawnPointDefSchema).min(1),
        /** Nhóm quái của map thường (dungeon dùng nhóm trong từng phase). */
        monsterGroups: z.array(MonsterGroupSchema).default([]),
        npcs: z.array(NpcSlotSchema).default([]),
        interactables: z.array(InteractableDefSchema).default([]),
        dungeon: DungeonDefSchema.optional(),
    })
    .superRefine((map, ctx) => {
        const duplicate = (path: (string | number)[], message = "duplicate id") =>
            ctx.addIssue({ code: "custom", path, message });
        const spawnIds = new Set<string>();
        map.spawnPoints.forEach((point, i) => {
            if (spawnIds.has(point.id)) duplicate(["spawnPoints", i, "id"]);
            spawnIds.add(point.id);
        });
        // Dungeon không cần `default` (vào bằng spawn đến từ cổng); map thường cần đúng 1.
        const defaults = map.spawnPoints.filter((p) => p.kind === MapSpawnKind.DEFAULT).length;
        if (map.type === MapType.DUNGEON ? defaults > 1 : defaults !== 1) {
            ctx.addIssue({
                code: "custom",
                path: ["spawnPoints"],
                message:
                    map.type === MapType.DUNGEON
                        ? "at most one spawn point with kind=default is allowed"
                        : "exactly one spawn point with kind=default is required",
            });
        }
        if ((map.type === MapType.DUNGEON) !== (map.dungeon !== undefined)) {
            ctx.addIssue({
                code: "custom",
                path: ["dungeon"],
                message: "dungeon config is required for (and only for) type=dungeon",
            });
        }
        if (map.type === MapType.DUNGEON && map.monsterGroups.length > 0) {
            ctx.addIssue({
                code: "custom",
                path: ["monsterGroups"],
                message: "dungeon monsters are defined per phase",
            });
        }
        const markerIds = new Set<string>();
        const groups = [
            ...map.monsterGroups,
            ...(map.dungeon?.chambers.flatMap((c) => c.phases.flatMap((p) => p.groups)) ?? []),
        ];
        groups.forEach((group, i) => {
            if (markerIds.has(group.markerId)) duplicate(["monsterGroups", i, "markerId"]);
            markerIds.add(group.markerId);
        });
        const npcIds = new Set<string>();
        map.npcs.forEach((npc, i) => {
            if (npcIds.has(npc.id)) duplicate(["npcs", i, "id"]);
            npcIds.add(npc.id);
        });
        const interactableIds = new Set<string>();
        map.interactables.forEach((it, i) => {
            if (interactableIds.has(it.id)) duplicate(["interactables", i, "id"]);
            interactableIds.add(it.id);
        });
    });

export type MapDefinition = z.infer<typeof MapDefinitionSchema>;
/** Input chưa áp default (dùng khi viết data trong code). */
export type MapDefinitionInput = z.input<typeof MapDefinitionSchema>;
