import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import { MapSpawnKind } from "@/modules/maps/entities/game-map.entity.js";
import { GateCode } from "@/modules/maps/enums/gate-code.enum.js";
import { InteractableCode } from "@/modules/maps/enums/interactable-code.enum.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import {
    MapDefinitionSchema,
    type MapDefinition,
    type MapDefinitionInput,
} from "@/modules/maps/schemas/map-definition.schema.js";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";

/**
 * Định nghĩa mọi map — **config** (loại, level, số người, PvP, quái nào ở marker nào, portal đi đâu,
 * thưởng dungeon...) chỉnh ở đây rồi `yarn seed`. Unity chỉ đặt **vị trí** cho các marker liệt kê ở đây
 * (`map-markers.json` do `yarn config:export` xuất) và export `data/<code>.map.json`; chưa có file thì seed
 * tạo row placeholder (inactive) và server cảnh báo lúc khởi động.
 *
 * Mỗi map được ghi **đầy đủ, từng dòng** (không có hàm sinh dùng chung cho nhiều map) để sửa riêng một map
 * mà không ảnh hưởng map khác. Hướng nhìn của NPC không nằm ở đây: Unity chọn ở marker slot.
 */
const DEFINITIONS: MapDefinitionInput[] = [
    // ---- Town: không có level, an toàn; NPC đứng theo slot (hướng nhìn do Unity chọn ở marker).
    {
        code: "greenfield_village",
        type: MapType.TOWN,
        spawnPoints: [
            { id: "default", kind: MapSpawnKind.DEFAULT },
            { id: "from_field", kind: MapSpawnKind.ARRIVAL },
        ],
        npcs: [
            { id: "npc_village_chief", npcCode: "village_chief" },
            { id: "npc_guild_officer", npcCode: "guild_officer" },
            { id: "npc_swordsman_trainer", npcCode: "swordsman_trainer" },
            { id: "npc_archer_trainer", npcCode: "archer_trainer" },
            { id: "npc_cleric_trainer", npcCode: "cleric_trainer" },
            { id: "npc_village_priestess", npcCode: "village_priestess" },
            { id: "npc_blacksmith", npcCode: "blacksmith" },
            { id: "npc_alchemist", npcCode: "alchemist" },
            { id: "npc_general_merchant", npcCode: "general_merchant" },
            { id: "npc_hunter_garrick", npcCode: "hunter_garrick" },
            { id: "npc_researcher", npcCode: "researcher" },
            { id: "npc_innkeeper", npcCode: "innkeeper" },
            { id: "npc_farmer_rowan", npcCode: "farmer_rowan" },
            { id: "npc_herbalist", npcCode: "herbalist" },
            { id: "npc_guard_captain", npcCode: "guard_captain" },
        ],
        interactables: [
            { id: "teleport_village", type: "teleport", code: InteractableCode.TELEPORT },
            {
                id: "notice_board",
                type: "sign",
                code: InteractableCode.NOTICE_BOARD,
                radius: 0.5,
                dialogueCode: "notice_board",
            },
            {
                id: "south_gate",
                type: "portal",
                code: InteractableCode.PORTAL,
                radius: 1.8,
                targetMapCode: "greenfield_plains",
                targetSpawnId: "from_village",
            },
            {
                id: "east_gate",
                type: "portal",
                code: InteractableCode.PORTAL,
                radius: 1,
                targetMapCode: "whispering_forest",
                targetSpawnId: "from_village",
            },
        ],
    },
    // ---- Fields
    {
        code: "greenfield_plains",
        type: MapType.FIELD,
        minLevel: 1,
        monsterLevel: { min: 1, max: 10 },
        spawnPoints: [
            { id: "default", kind: MapSpawnKind.DEFAULT },
            { id: "from_village", kind: MapSpawnKind.ARRIVAL },
        ],
        monsterGroups: [
            { markerId: "g01", members: [{ monsterCode: "slime", count: 3, type: "random" }] },
            { markerId: "g02", members: [{ monsterCode: "slime", count: 3, type: "random" }] },
            { markerId: "g03", members: [{ monsterCode: "slime", count: 3, type: "random" }] },
            { markerId: "g04", members: [{ monsterCode: "slime", count: 3, type: "random" }] },
            { markerId: "g05", members: [{ monsterCode: "slime", count: 3, type: "random" }] },
            { markerId: "g06", members: [{ monsterCode: "slime", count: 3, type: "random" }] },
            { markerId: "g07", members: [{ monsterCode: "slime", count: 3, type: "random" }] },
            { markerId: "g08", members: [{ monsterCode: "slime", count: 3, type: "random" }] },
            { markerId: "g09", members: [{ monsterCode: "slime", count: 3, type: "random" }] },
            { markerId: "g10", members: [{ monsterCode: "slime", count: 3, type: "random" }] },
            { markerId: "g11", members: [{ monsterCode: "bat", count: 3, type: "random" }] },
            { markerId: "g12", members: [{ monsterCode: "bat", count: 3, type: "random" }] },
            { markerId: "g13", members: [{ monsterCode: "bat", count: 3, type: "random" }] },
            { markerId: "g14", members: [{ monsterCode: "bat", count: 3, type: "random" }] },
            { markerId: "g15", members: [{ monsterCode: "bat", count: 3, type: "random" }] },
            { markerId: "g16", members: [{ monsterCode: "bat", count: 3, type: "random" }] },
        ],
        interactables: [
            { id: "teleport_plains", type: "teleport", code: InteractableCode.TELEPORT },
            {
                id: "to_village",
                type: "portal",
                code: InteractableCode.PORTAL,
                radius: 1.2,
                targetMapCode: "greenfield_village",
                targetSpawnId: "from_field",
            },
            {
                id: "to_slime_hollow",
                type: "portal",
                code: InteractableCode.ENTRY_DUNGEON,
                radius: 1.5,
                targetMapCode: "slime_hollow",
                targetSpawnId: "from_plains",
            },
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
        ],
        monsterGroups: [
            {
                markerId: "g01",
                members: [{ monsterCode: "werewolf", count: 3, type: "random" }],
            },
            {
                markerId: "g02",
                members: [{ monsterCode: "werewolf", count: 3, type: "random" }],
            },
            {
                markerId: "g03",
                members: [{ monsterCode: "werewolf", count: 3, type: "random" }],
            },
            {
                markerId: "g04",
                members: [{ monsterCode: "werewolf", count: 3, type: "random" }],
            },
            {
                markerId: "g05",
                members: [{ monsterCode: "werewolf", count: 3, type: "random" }],
            },
            {
                markerId: "g06",
                members: [{ monsterCode: "bat", count: 3, type: "random" }],
            },
            {
                markerId: "g07",
                members: [{ monsterCode: "bat", count: 3, type: "random" }],
            },
            {
                markerId: "g08",
                members: [{ monsterCode: "bat", count: 3, type: "random" }],
            },
            {
                markerId: "g09",
                members: [{ monsterCode: "bat", count: 3, type: "random" }],
            },
            {
                markerId: "g10",
                members: [{ monsterCode: "bat", count: 3, type: "random" }],
            },
            {
                markerId: "g11",
                members: [
                    { monsterCode: "bat", count: 1, type: "random" },
                    { monsterCode: "werewolf", count: 2, type: "random" },
                ],
            },
            {
                markerId: "g12",
                members: [
                    { monsterCode: "bat", count: 1, type: "random" },
                    { monsterCode: "werewolf", count: 2, type: "random" },
                ],
            },
            {
                markerId: "g13",
                members: [
                    { monsterCode: "bat", count: 1, type: "random" },
                    { monsterCode: "werewolf", count: 2, type: "random" },
                ],
            },
            {
                markerId: "g14",
                members: [
                    { monsterCode: "bat", count: 1, type: "random" },
                    { monsterCode: "werewolf", count: 2, type: "random" },
                ],
            },
            {
                markerId: "g15",
                members: [
                    { monsterCode: "bat", count: 1, type: "random" },
                    { monsterCode: "werewolf", count: 2, type: "random" },
                ],
            },
        ],
        interactables: [
            { id: "teleport_forest", type: "teleport", code: InteractableCode.TELEPORT },
            {
                id: "forest_to_village",
                type: "portal",
                code: InteractableCode.PORTAL,
                radius: 1.5,
                targetMapCode: "greenfield_village",
                targetSpawnId: "from_field",
            },
            {
                id: "forest_to_evergrowth",
                type: "portal",
                code: InteractableCode.PORTAL,
                radius: 1.5,
                targetMapCode: "deep_evergrowth",
                targetSpawnId: "from_forest",
            },
            {
                id: "forest_to_werewolf_den",
                type: "portal",
                code: InteractableCode.ENTRY_DUNGEON,
                radius: 1.5,
                targetMapCode: "werewolf_den",
                targetSpawnId: "from_forest",
            },
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
        ],
        monsterGroups: [
            {
                markerId: "g01",
                members: [{ monsterCode: "werewolf", count: 3, type: "random" }],
            },
            {
                markerId: "g02",
                members: [{ monsterCode: "werewolf", count: 3, type: "random" }],
            },
            {
                markerId: "g03",
                members: [{ monsterCode: "werewolf", count: 3, type: "random" }],
            },
            {
                markerId: "g04",
                members: [{ monsterCode: "werewolf", count: 3, type: "random" }],
            },
            {
                markerId: "g05",
                members: [{ monsterCode: "werewolf", count: 3, type: "random" }],
            },
            {
                markerId: "g06",
                members: [{ monsterCode: "werebear", count: 3, type: "random" }],
            },
            {
                markerId: "g07",
                members: [{ monsterCode: "werebear", count: 3, type: "random" }],
            },
            {
                markerId: "g08",
                members: [{ monsterCode: "werebear", count: 3, type: "random" }],
            },
            {
                markerId: "g09",
                members: [{ monsterCode: "werebear", count: 3, type: "random" }],
            },
            {
                markerId: "g10",
                members: [{ monsterCode: "werebear", count: 3, type: "random" }],
            },
        ],
        interactables: [
            { id: "teleport_evergrowth", type: "teleport", code: InteractableCode.TELEPORT },
            {
                id: "evergrowth_to_forest",
                type: "portal",
                code: InteractableCode.PORTAL,
                radius: 1.5,
                targetMapCode: "whispering_forest",
                targetSpawnId: "from_evergrowth",
            },
            {
                id: "evergrowth_to_sanctuary",
                type: "portal",
                code: InteractableCode.ENTRY_DUNGEON,
                radius: 1.5,
                targetMapCode: "sanctuary_of_life",
                targetSpawnId: "from_evergrowth",
            },
        ],
    },
    // ---- Dungeons: mỗi map tự ghi đủ chamber / phase / quái / thưởng của mình.
    {
        code: "slime_hollow",
        type: MapType.DUNGEON,
        minLevel: 1,
        spawnPoints: [{ id: "from_plains", kind: MapSpawnKind.ARRIVAL }],
        dungeon: {
            gateCode: GateCode.SLIME_GATE,
            maxLevel: 10,
            timeLimitSec: 1200,
            clearReward: {
                exp: 600,
                currency: [{ code: CurrencyCode.GOLD, amount: 300 }],
                slots: 4,
                dropItems: [
                    { itemCode: "hp_potion_small", min: 1, max: 5, rate: 0.1 },
                    { itemCode: "enhance_stone_1", min: 1, max: 5, rate: 0.1 },
                ],
                equipment: {
                    biome: Biome.SLIME,
                    rarity: {
                        [ItemRarity.COMMON]: 90,
                        [ItemRarity.GOOD]: 8,
                        [ItemRarity.RARE]: 1.5,
                        [ItemRarity.EPIC]: 0.4,
                        [ItemRarity.LEGENDARY]: 0.1,
                    },
                },
            },
            chambers: [
                {
                    id: "c1",
                    phases: [
                        {
                            id: "p1",
                            delaySec: 0,
                            groups: [
                                {
                                    markerId: "c1_p1_1",
                                    members: [{ monsterCode: "slime", count: 3 }],
                                },
                                {
                                    markerId: "c1_p1_2",
                                    members: [{ monsterCode: "slime", count: 3 }],
                                },
                                {
                                    markerId: "c1_p1_3",
                                    members: [{ monsterCode: "slime", count: 3 }],
                                },
                                {
                                    markerId: "c1_p1_4",
                                    members: [{ monsterCode: "slime", count: 3 }],
                                },
                            ],
                        },
                    ],
                },
                {
                    id: "c2",
                    phases: [
                        {
                            id: "p1",
                            delaySec: 0,
                            groups: [
                                {
                                    markerId: "c2_p1a",
                                    members: [{ monsterCode: "slime", count: 4 }],
                                },
                                { markerId: "c2_p1b", members: [{ monsterCode: "bat", count: 4 }] },
                                {
                                    markerId: "c2_p2",
                                    members: [
                                        { monsterCode: "bat", count: 1, type: MonsterType.ELITE },
                                    ],
                                },
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
                                {
                                    markerId: "c3_boss",
                                    members: [
                                        { monsterCode: "slime", count: 1, type: MonsterType.BOSS },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    },
    {
        code: "werewolf_den",
        type: MapType.DUNGEON,
        minLevel: 10,
        spawnPoints: [{ id: "from_forest", kind: MapSpawnKind.ARRIVAL }],
        dungeon: {
            gateCode: GateCode.WEREWOLF_GATE,
            maxLevel: 20,
            timeLimitSec: 1500,
            clearReward: {
                exp: 3000,
                currency: [{ code: CurrencyCode.GOLD, amount: 1200 }],
                slots: 4,
                dropItems: [
                    { itemCode: "hp_potion_small", min: 1, max: 5, rate: 0.05 },
                    { itemCode: "enhance_stone_1", min: 1, max: 5, rate: 0.05 },
                    { itemCode: "enhance_stone_2", min: 1, max: 5, rate: 0.05 },
                ],
                equipment: {
                    biome: Biome.SLIME,
                    rarity: {
                        [ItemRarity.COMMON]: 90,
                        [ItemRarity.GOOD]: 8,
                        [ItemRarity.RARE]: 1.5,
                        [ItemRarity.EPIC]: 0.4,
                        [ItemRarity.LEGENDARY]: 0.1,
                    },
                },
            },
            chambers: [
                {
                    id: "c1",
                    phases: [
                        {
                            id: "p1",
                            delaySec: 0,
                            groups: [
                                {
                                    markerId: "c1_p1_1",
                                    members: [{ monsterCode: "bat", count: 3 }],
                                },
                                {
                                    markerId: "c1_p1_2",
                                    members: [{ monsterCode: "bat", count: 3 }],
                                },
                                {
                                    markerId: "c1_p1_3",
                                    members: [{ monsterCode: "werewolf", count: 3 }],
                                },
                                {
                                    markerId: "c1_p1_4",
                                    members: [{ monsterCode: "werewolf", count: 3 }],
                                },
                            ],
                        },
                    ],
                },
                {
                    id: "c2",
                    phases: [
                        {
                            id: "p1",
                            delaySec: 0,
                            groups: [
                                {
                                    markerId: "c2_p1a",
                                    members: [{ monsterCode: "werewolf", count: 4 }],
                                },
                                { markerId: "c2_p1b", members: [{ monsterCode: "bat", count: 4 }] },
                                {
                                    markerId: "c2_p2",
                                    members: [
                                        { monsterCode: "bat", count: 1, type: MonsterType.ELITE },
                                    ],
                                },
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
                                {
                                    markerId: "c3_boss",
                                    members: [
                                        {
                                            monsterCode: "werewolf",
                                            count: 1,
                                            type: MonsterType.BOSS,
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    },
    {
        code: "sanctuary_of_life",
        type: MapType.DUNGEON,
        minLevel: 20,
        spawnPoints: [{ id: "from_evergrowth", kind: MapSpawnKind.ARRIVAL }],
        dungeon: {
            gateCode: GateCode.SANCTUARY_GATE,
            maxLevel: 30,
            timeLimitSec: 1800,
            clearReward: {
                exp: 9000,
                currency: [{ code: CurrencyCode.GOLD, amount: 3500 }],
                slots: 4,
                dropItems: [
                    { itemCode: "hp_potion_small", min: 1, max: 5, rate: 0.05 },
                    { itemCode: "enhance_stone_2", min: 1, max: 5, rate: 0.05 },
                    { itemCode: "enhance_stone_3", min: 1, max: 5, rate: 0.05 },
                ],
                equipment: {
                    biome: Biome.SLIME,
                    rarity: {
                        [ItemRarity.COMMON]: 90,
                        [ItemRarity.GOOD]: 8,
                        [ItemRarity.RARE]: 1.5,
                        [ItemRarity.EPIC]: 0.4,
                        [ItemRarity.LEGENDARY]: 0.1,
                    },
                },
            },
            chambers: [
                {
                    id: "c1",
                    phases: [
                        {
                            id: "p1",
                            delaySec: 0,
                            groups: [
                                {
                                    markerId: "c1_p1_1",
                                    members: [{ monsterCode: "werewolf", count: 3 }],
                                },
                                {
                                    markerId: "c1_p1_2",
                                    members: [{ monsterCode: "werewolf", count: 3 }],
                                },
                                {
                                    markerId: "c1_p1_3",
                                    members: [{ monsterCode: "werebear", count: 3 }],
                                },
                                {
                                    markerId: "c1_p1_4",
                                    members: [{ monsterCode: "werebear", count: 3 }],
                                },
                            ],
                        },
                    ],
                },
                {
                    id: "c2",
                    phases: [
                        {
                            id: "p1",
                            delaySec: 0,
                            groups: [
                                {
                                    markerId: "c2_p1a",
                                    members: [{ monsterCode: "werewolf", count: 4 }],
                                },
                                {
                                    markerId: "c2_p1b",
                                    members: [{ monsterCode: "werebear", count: 4 }],
                                },
                                {
                                    markerId: "c2_p2",
                                    members: [
                                        {
                                            monsterCode: "werewolf",
                                            count: 1,
                                            type: MonsterType.ELITE,
                                        },
                                    ],
                                },
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
                                {
                                    markerId: "c3_boss",
                                    members: [
                                        {
                                            monsterCode: "werebear",
                                            count: 1,
                                            type: MonsterType.BOSS,
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    },
];

/** Đã parse + áp default; sai cấu trúc thì ném lỗi ngay lúc import (seed / test / server). */
export const MAP_DEFINITIONS: MapDefinition[] = DEFINITIONS.map((definition) =>
    MapDefinitionSchema.parse(definition)
);
