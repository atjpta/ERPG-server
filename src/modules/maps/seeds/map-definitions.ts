import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import { MapSpawnKind } from "@/modules/maps/entities/game-map.entity.js";
import { InteractableCode } from "@/modules/maps/enums/interactable-code.enum.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import {
    MapDefinitionSchema,
    type InteractableDef,
    type MapDefinition,
    type MapDefinitionInput,
    type MonsterGroup,
    type MonsterMember,
} from "@/modules/maps/schemas/map-definition.schema.js";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";

/**
 * Định nghĩa mọi map — **config** (loại, level, số người, PvP, quái nào ở marker nào, portal đi đâu,
 * thưởng dungeon...) chỉnh ở đây rồi `yarn seed`. Unity chỉ đặt **vị trí** cho các marker liệt kê ở đây
 * (`map-markers.json` do `yarn config:export` xuất) và export `data/<code>.map.json`; chưa có file thì seed
 * tạo row placeholder (inactive) và server cảnh báo lúc khởi động.
 */
const group = (markerId: string, ...members: MonsterMember[]): MonsterGroup => ({
    markerId,
    members,
});
const mob = (
    monsterCode: string,
    count: number,
    extra: Partial<MonsterMember> = {}
): MonsterMember => ({
    monsterCode,
    count,
    ...extra,
});
const noItems: { itemCode: string; quantity: number }[] = [];
const gold = (amount: number) => [{ code: CurrencyCode.GOLD, amount }];

const portal = (
    id: string,
    targetMapCode: string,
    targetSpawnId: string,
    radius = 1.5
): InteractableDef => ({
    id,
    type: "portal",
    code: InteractableCode.PORTAL,
    radius,
    targetMapCode,
    targetSpawnId,
});

const numbered = (prefix: string, count: number, make: (id: string) => MonsterGroup) =>
    Array.from({ length: count }, (_, i) => make(`${prefix}${String(i + 1).padStart(2, "0")}`));

/**
 * Dungeon 3 chamber: 1–2 là quái thường (+ tinh anh ở chamber 2), chamber 3 là boss kèm quái hỗ trợ.
 * Mỗi chamber 2 phase — phase sau spawn thêm sau `delaySec` giây.
 */
const dungeonChambers = (
    normal: string,
    support: string,
    elite: string,
    boss: string,
    reward: { exp: number; gold: number }
) => [
    {
        id: "c1",
        clearReward: { exp: reward.exp, currency: gold(reward.gold), items: noItems },
        phases: [
            { id: "p1", delaySec: 0, groups: [group("c1_p1", mob(normal, 3))] },
            { id: "p2", delaySec: 20, groups: [group("c1_p2", mob(normal, 2), mob(support, 2))] },
        ],
    },
    {
        id: "c2",
        clearReward: { exp: reward.exp * 2, currency: gold(reward.gold * 2), items: noItems },
        phases: [
            {
                id: "p1",
                delaySec: 0,
                groups: [group("c2_p1a", mob(normal, 4)), group("c2_p1b", mob(support, 2))],
            },
            {
                id: "p2",
                delaySec: 25,
                groups: [
                    group("c2_p2", mob(elite, 1, { type: MonsterType.ELITE }), mob(normal, 2)),
                ],
            },
        ],
    },
    {
        id: "c3",
        isBoss: true,
        phases: [
            {
                id: "p1",
                delaySec: 0,
                groups: [
                    group("c3_boss", mob(boss, 1, { type: MonsterType.BOSS })),
                    group("c3_p1", mob(normal, 2)),
                ],
            },
            { id: "p2", delaySec: 30, groups: [group("c3_p2", mob(support, 3))] },
        ],
    },
];

const DEFINITIONS: MapDefinitionInput[] = [
    // ---- Town
    {
        code: "greenfield_village",
        type: MapType.TOWN,
        spawnPoints: [
            { id: "default", kind: MapSpawnKind.DEFAULT },
            { id: "from_field", kind: MapSpawnKind.ARRIVAL },
        ],
        npcs: [
            { id: "npc_village_chief", npcCode: "village_chief", direction: "left" },
            { id: "npc_guild_officer", npcCode: "guild_officer", direction: "right" },
            { id: "npc_swordsman_trainer", npcCode: "swordsman_trainer", direction: "right" },
            { id: "npc_archer_trainer", npcCode: "archer_trainer", direction: "left" },
            { id: "npc_cleric_trainer", npcCode: "cleric_trainer", direction: "right" },
            { id: "npc_village_priestess", npcCode: "village_priestess", direction: "left" },
            { id: "npc_blacksmith", npcCode: "blacksmith", direction: "left" },
            { id: "npc_alchemist", npcCode: "alchemist", direction: "left" },
            { id: "npc_general_merchant", npcCode: "general_merchant", direction: "right" },
            { id: "npc_hunter_garrick", npcCode: "hunter_garrick", direction: "left" },
            { id: "npc_researcher", npcCode: "researcher", direction: "right" },
            { id: "npc_innkeeper", npcCode: "innkeeper", direction: "right" },
            { id: "npc_farmer_rowan", npcCode: "farmer_rowan", direction: "right" },
            { id: "npc_herbalist", npcCode: "herbalist", direction: "left" },
            { id: "npc_guard_captain", npcCode: "guard_captain", direction: "right" },
        ],
        interactables: [
            {
                id: "notice_board",
                type: "sign",
                code: InteractableCode.NOTICE_BOARD,
                radius: 0.5,
                dialogueCode: "notice_board",
            },
            portal("south_gate", "greenfield_plains", "from_village", 1.8),
            portal("east_gate", "whispering_forest", "from_village", 1),
            {
                id: "north_gate",
                type: "sign",
                radius: 1,
                dialogueCode: "gate_locked",
            },
        ],
    },
    // ---- Fields
    {
        code: "greenfield_plains",
        type: MapType.FIELD,
        minLevel: 1,
        monsterLevel: { min: 1, max: 5 },
        spawnPoints: [
            { id: "default", kind: MapSpawnKind.DEFAULT },
            { id: "from_village", kind: MapSpawnKind.ARRIVAL },
            { id: "respawn", kind: MapSpawnKind.RESPAWN },
        ],
        monsterGroups: [
            ...numbered("g", 10, (id) => group(id, mob("slime", 3, { type: "random" }))),
            ...Array.from({ length: 6 }, (_, i) =>
                group(`g${String(i + 11).padStart(2, "0")}`, mob("bat", 3, { type: "random" }))
            ),
        ],
        interactables: [
            portal("to_village", "greenfield_village", "from_field", 1.2),
            portal("to_slime_hollow", "slime_hollow", "from_plains"),
        ],
    },
    {
        code: "whispering_forest",
        type: MapType.FIELD,
        minLevel: 10,
        monsterLevel: { min: 10, max: 19 },
        spawnPoints: [
            { id: "default", kind: MapSpawnKind.DEFAULT },
            { id: "from_village", kind: MapSpawnKind.ARRIVAL },
            { id: "from_evergrowth", kind: MapSpawnKind.ARRIVAL },
            { id: "respawn", kind: MapSpawnKind.RESPAWN },
        ],
        monsterGroups: [
            // Nhóm hỗn hợp: 2 werewolf + 1 bat quanh mỗi marker.
            ...numbered("f", 6, (id) =>
                group(id, mob("werewolf", 2, { type: "random" }), mob("bat", 1, { type: "random" }))
            ),
            ...Array.from({ length: 4 }, (_, i) =>
                group(`f${String(i + 7).padStart(2, "0")}`, mob("bat", 3, { type: "random" }))
            ),
        ],
        interactables: [
            portal("forest_to_village", "greenfield_village", "from_field"),
            portal("forest_to_evergrowth", "deep_evergrowth", "from_forest"),
            portal("forest_to_werewolf_den", "werewolf_den", "from_forest"),
        ],
    },
    {
        code: "deep_evergrowth",
        type: MapType.FIELD,
        minLevel: 20,
        monsterLevel: { min: 20, max: 29 },
        spawnPoints: [
            { id: "default", kind: MapSpawnKind.DEFAULT },
            { id: "from_forest", kind: MapSpawnKind.ARRIVAL },
            { id: "respawn", kind: MapSpawnKind.RESPAWN },
        ],
        monsterGroups: [
            ...numbered("e", 6, (id) =>
                group(
                    id,
                    mob("werewolf", 2, { type: "random" }),
                    mob("werebear", 1, { type: "random" })
                )
            ),
            ...Array.from({ length: 4 }, (_, i) =>
                group(`e${String(i + 7).padStart(2, "0")}`, mob("werebear", 2, { type: "random" }))
            ),
        ],
        interactables: [
            portal("evergrowth_to_forest", "whispering_forest", "from_evergrowth"),
            portal("evergrowth_to_sanctuary", "sanctuary_of_life", "from_evergrowth"),
        ],
    },
    // ---- Dungeons
    {
        code: "slime_hollow",
        type: MapType.DUNGEON,
        minLevel: 1,
        maxPlayersPerChannel: 4,
        spawnPoints: [
            { id: "default", kind: MapSpawnKind.DEFAULT },
            { id: "from_plains", kind: MapSpawnKind.ARRIVAL },
        ],
        dungeon: {
            maxLevel: 10,
            timeLimitSec: 1200,
            clearReward: {
                exp: 600,
                currency: gold(300),
                items: [{ itemCode: "hp_potion_small", quantity: 5 }],
            },
            chambers: dungeonChambers("slime", "bat", "bat", "slime", { exp: 80, gold: 40 }),
        },
    },
    {
        code: "werewolf_den",
        type: MapType.DUNGEON,
        minLevel: 10,
        maxPlayersPerChannel: 4,
        spawnPoints: [
            { id: "default", kind: MapSpawnKind.DEFAULT },
            { id: "from_forest", kind: MapSpawnKind.ARRIVAL },
        ],
        dungeon: {
            maxLevel: 20,
            timeLimitSec: 1500,
            clearReward: {
                exp: 3000,
                currency: gold(1200),
                items: [{ itemCode: "hp_potion_small", quantity: 5 }],
            },
            chambers: dungeonChambers("werewolf", "bat", "bat", "werewolf", {
                exp: 400,
                gold: 150,
            }),
        },
    },
    {
        code: "sanctuary_of_life",
        type: MapType.DUNGEON,
        minLevel: 20,
        maxPlayersPerChannel: 4,
        spawnPoints: [
            { id: "default", kind: MapSpawnKind.DEFAULT },
            { id: "from_evergrowth", kind: MapSpawnKind.ARRIVAL },
        ],
        dungeon: {
            maxLevel: 30,
            timeLimitSec: 1800,
            clearReward: {
                exp: 9000,
                currency: gold(3500),
                items: [{ itemCode: "hp_potion_small", quantity: 5 }],
            },
            chambers: dungeonChambers("werewolf", "werebear", "werewolf", "werebear", {
                exp: 1200,
                gold: 400,
            }),
        },
    },
];

/** Đã parse + áp default; sai cấu trúc thì ném lỗi ngay lúc import (seed / test / server). */
export const MAP_DEFINITIONS: MapDefinition[] = DEFINITIONS.map((definition) =>
    MapDefinitionSchema.parse(definition)
);
