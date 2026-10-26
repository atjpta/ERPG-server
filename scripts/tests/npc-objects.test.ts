import { MapSpawnKind } from "@/modules/maps/enums/game-map.enum.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import {
    MapDefinitionSchema,
    type MapDefinition,
} from "@/modules/maps/schemas/map-definition.schema.js";
import { MapLayoutSchema } from "@/modules/maps/schemas/map-layout.schema.js";
import { buildMapRow, validateDefinitionRefs } from "@/modules/maps/seeds/map-build.seed-util.js";
import { teleportService } from "@/modules/maps/services/teleport.service.js";
import type { MapNpc } from "@/modules/maps/types/game-map.type.js";
import { NpcCode } from "@/modules/npcs/enums/npc-code.enum.js";
import { NpcKind } from "@/modules/npcs/enums/npc-kind.enum.js";
import { NpcFunctionSchema, NpcFunctionType } from "@/modules/npcs/schemas/npc-function.schema.js";
import { npcService } from "@/modules/npcs/services/npc.service.js";
import { findContentRefErrors } from "@/modules/quests/seeds/content-refs.seed-util.js";
import { check, checkEqual, test } from "./harness.js";

const portalFn = (targetMapCode: string, targetSpawnId: string) => ({
    id: "enter",
    type: NpcFunctionType.PORTAL as const,
    config: { targetMapCode, targetSpawnId },
});

const definition = (
    code: string,
    npcs: Array<Record<string, unknown>>,
    type: MapType = MapType.FIELD
): MapDefinition =>
    MapDefinitionSchema.parse({
        code,
        type,
        minLevel: 1,
        maxPlayersPerChannel: 10,
        spawnPoints: [
            { id: "default", kind: MapSpawnKind.DEFAULT },
            { id: "arrival", kind: MapSpawnKind.ARRIVAL },
        ],
        npcs,
    });

const slot = (id: string, over: Partial<MapNpc> = {}): MapNpc => ({
    id,
    npcCode: NpcCode.TELEPORT_PAD,
    x: 3,
    y: 4,
    direction: "right",
    ...over,
});

test("npc object: chức năng có config đúng kiểu theo loại", async () => {
    check(NpcFunctionSchema.safeParse(portalFn("a", "arrival")).success, "valid portal");
    check(
        !NpcFunctionSchema.safeParse({ id: "enter", type: "portal", config: {} }).success,
        "portal needs a target"
    );
    check(
        NpcFunctionSchema.safeParse({ id: "t", type: "teleport" }).success,
        "teleport config is optional"
    );
    check(
        !NpcFunctionSchema.safeParse({
            id: "g",
            type: "gather",
            config: { reward: {}, respawnSec: 0 },
        }).success,
        "gather needs a positive respawn"
    );
});

test("npc object: template object có sẵn trong cache (teleport_pad có chức năng teleport)", async () => {
    const pad = npcService.getByCode(NpcCode.TELEPORT_PAD);
    check(pad, "teleport_pad is seeded");
    checkEqual(pad.kind, NpcKind.OBJECT, "kind");
    check(pad.autoOpen, "autoOpen");
    checkEqual(
        npcService.functionsOf({ npcCode: NpcCode.TELEPORT_PAD }).map((fn) => fn.type),
        [NpcFunctionType.TELEPORT],
        "template function"
    );
    // slot ghi đè hẳn chức năng của template
    checkEqual(
        npcService
            .functionsOf({ npcCode: NpcCode.PORTAL_GATE, functions: [portalFn("a", "b")] })
            .map((fn) => fn.id),
        ["enter"],
        "slot function replaces the template's"
    );
    checkEqual(
        npcService.radiusOf({ npcCode: NpcCode.TELEPORT_PAD, radius: 1.2 }),
        1.2,
        "slot radius"
    );
    checkEqual(
        npcService.radiusOf({ npcCode: NpcCode.TELEPORT_PAD }),
        npcService.getByCode(NpcCode.TELEPORT_PAD)!.interactRadius,
        "falls back to the npc radius"
    );
});

test("npc object: bệ teleport = slot có chức năng teleport (slot hoặc template)", async () => {
    const maps = [
        { code: "a", type: MapType.FIELD, minLevel: 5, npcs: [slot("pad_a")] },
        {
            code: "b",
            type: MapType.FIELD,
            minLevel: 1,
            npcs: [
                slot("pad_b", {
                    functions: [
                        {
                            id: "teleport",
                            type: NpcFunctionType.TELEPORT,
                            config: { openToAll: true },
                        },
                    ],
                }),
            ],
        },
        // có NPC nhưng không có bệ: hiện mờ
        {
            code: "c",
            type: MapType.FIELD,
            minLevel: 9,
            npcs: [slot("board", { npcCode: NpcCode.NOTICE_BOARD })],
        },
        { code: "dungeon", type: MapType.DUNGEON, minLevel: 1, npcs: [] },
    ];
    const list = teleportService.listTeleportDestinations(maps, "elsewhere");
    checkEqual(
        list.map((d) => [d.mapCode, d.open, d.teleportId ?? null, d.openToAll ?? false]),
        [
            ["b", true, "pad_b", true],
            ["a", true, "pad_a", false],
            ["c", false, null, false],
        ],
        "destinations sorted by level; dungeons skipped"
    );
});

test("npc object: id slot trùng giữa các map / đích cổng sai bị bắt khi seed", async () => {
    const a = definition("map_a", [
        { id: "gate", npcCode: "portal_gate", functions: [portalFn("map_b", "arrival")] },
    ]);
    const b = definition("map_b", [
        { id: "gate", npcCode: "portal_gate", functions: [portalFn("nowhere", "arrival")] },
    ]);
    const errors = validateDefinitionRefs([a, b]);
    check(
        errors.some((e) => e.includes("trùng")),
        `duplicate slot id: ${errors.join(" | ")}`
    );
    check(
        errors.some((e) => e.includes('unknown map "nowhere"')),
        "unknown target map"
    );
    const c = definition("map_c", [
        { id: "gate_c", npcCode: "portal_gate", functions: [portalFn("map_a", "missing")] },
    ]);
    check(
        validateDefinitionRefs([a, c]).some((e) => e.includes('unknown spawn "map_a.missing"')),
        "unknown target spawn"
    );
    checkEqual(validateDefinitionRefs([a, definition("map_b", [])]), [], "valid definition");
});

test("npc object: ghép định nghĩa + layout giữ radius / chức năng của slot, thiếu vị trí thì báo", async () => {
    const def = definition("map_a", [
        {
            id: "gate",
            npcCode: "portal_gate",
            radius: 1.8,
            functions: [portalFn("map_a", "arrival")],
        },
        { id: "pad", npcCode: "teleport_pad" },
    ]);
    const layout = MapLayoutSchema.parse({
        code: "map_a",
        width: 20,
        height: 20,
        spawnPoints: [
            { id: "default", x: 0, y: 0 },
            { id: "arrival", x: 1, y: 1 },
        ],
        npcs: [{ id: "gate", x: 2, y: 3, direction: "down" }],
    });
    const { row, missing } = buildMapRow(def, layout, "hash");
    checkEqual(missing, ["npc:pad"], "pad has no position yet");
    checkEqual(row.npcs?.length, 1, "only placed slots are built");
    const gate = row.npcs![0];
    checkEqual(
        [gate.id, gate.x, gate.y, gate.direction, gate.radius],
        ["gate", 2, 3, "down", 1.8],
        "gate"
    );
    checkEqual(gate.functions?.[0].type, NpcFunctionType.PORTAL, "gate function kept");
});

test("npc object: vật thể autoOpen mà không có chức năng nào bị bắt khi seed", async () => {
    const def = definition("map_a", [{ id: "broken", npcCode: "portal_gate" }]);
    const errors = findContentRefErrors({
        maps: [def],
        npcs: [
            {
                code: "portal_gate",
                kind: NpcKind.OBJECT,
                autoOpen: true,
                defaultDialogueCode: null,
                dialogueRules: [],
                functions: [],
            },
        ],
        dialogues: [],
        quests: [],
        itemCodes: new Set(),
        monsterCodes: new Set(),
        dungeonMapCodes: new Set(),
    });
    check(
        errors.some((e) => e.includes("autoOpen but has no function")),
        errors.join(" | ")
    );
});
