import assert from "node:assert/strict";
import { MapSpawnKind } from "@/modules/maps/entities/game-map.entity.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import {
    MapDefinitionSchema,
    type MapDefinitionInput,
} from "@/modules/maps/schemas/map-definition.schema.js";
import { MapLayoutSchema } from "@/modules/maps/schemas/map-layout.schema.js";
import {
    buildAllMapRows,
    definitionsWithoutLayout,
    loadMapDefinitions,
    loadMapLayouts,
} from "@/modules/maps/seeds/game-map.seed.js";
import {
    buildMapRow,
    buildPlaceholderRow,
    expandMonsterGroup,
    mapMarkerList,
    validateDefinitionRefs,
    validateLayoutAgainstDefinition,
} from "@/modules/maps/seeds/map-build.seed-util.js";
import {
    hasVisited,
    listTeleportDestinations,
    teleportStatus,
    visitedFlagKey,
} from "@/modules/maps/services/teleport.service.js";
import { hashMapLayout, parseMapLayout } from "@/modules/maps/services/map-file.service.js";

const definition = (extra: Partial<MapDefinitionInput> = {}) =>
    MapDefinitionSchema.parse({
        code: "t",
        type: MapType.FIELD,
        monsterLevel: { min: 2, max: 4 },
        spawnPoints: [
            { id: "default", kind: MapSpawnKind.DEFAULT },
            { id: "respawn", kind: MapSpawnKind.RESPAWN },
        ],
        monsterGroups: [
            {
                markerId: "g1",
                members: [
                    { monsterCode: "slime", count: 2, type: "random" },
                    { monsterCode: "bat", count: 2, minLevel: 6, maxLevel: 7 },
                ],
            },
        ],
        npcs: [{ id: "npc_a", npcCode: "village_chief" }],
        interactables: [
            { id: "gate", type: "portal", targetMapCode: "t", targetSpawnId: "default" },
        ],
        ...extra,
    });

const layout = (extra: Record<string, unknown> = {}) =>
    parseMapLayout({
        code: "t",
        width: 20,
        height: 20,
        spawnPoints: [
            { id: "default", x: 1, y: 1 },
            { id: "respawn", x: 2, y: 2 },
        ],
        monsters: [{ id: "g1", x: 10, y: 10 }],
        npcs: [{ id: "npc_a", x: 3, y: 3 }],
        interactables: [{ id: "gate", x: 4, y: 4 }],
        ...extra,
    });

describe("map definitions + layout", () => {
    it("mọi định nghĩa và file layout trong repo đều hợp lệ và ghép được", () => {
        assert.ok(loadMapDefinitions().length >= 7);
        assert.ok(loadMapLayouts().length >= 2);
        const rows = buildAllMapRows();
        assert.equal(rows.length, loadMapDefinitions().length);
        for (const layoutFile of loadMapLayouts()) {
            assert.equal(rows.find((row) => row.code === layoutFile.code)?.layoutReady, true);
        }
    });

    it("map chưa có file Unity thành placeholder inactive, vẫn giữ config", () => {
        const layouts = loadMapLayouts();
        for (const def of definitionsWithoutLayout(layouts)) {
            assert.ok(!layouts.some((layoutFile) => layoutFile.code === def.code));
            assert.equal(buildAllMapRows().find((r) => r.code === def.code)?.layoutReady, false);
        }
        const dungeon = loadMapDefinitions().find((def) => def.code === "slime_hollow")!;
        const row = buildPlaceholderRow(dungeon);
        assert.equal(row.layoutReady, false);
        assert.equal(row.status, "inactive");
        assert.equal(row.minLevel, 1);
        assert.equal(row.dungeon?.maxLevel, 10);
        assert.deepEqual(row.dungeon?.chambers, []);
    });

    it("config (max người, pvp, level, loại) lấy từ định nghĩa, vị trí từ layout", () => {
        const { row } = buildMapRow(
            definition({ maxPlayersPerChannel: 50, pvpEnabled: true }),
            layout(),
            "h"
        );
        assert.equal(row.maxPlayersPerChannel, 50);
        assert.equal(row.pvpEnabled, true);
        assert.equal(row.spawnX, 1);
        assert.equal(row.width, 20);
        assert.deepEqual(row.npcs, [{ npcCode: "village_chief", x: 3, y: 3, direction: "right" }]);
        assert.equal(row.interactables?.[0].x, 4);
    });

    it("hash không phụ thuộc thứ tự khoá, đổi vị trí thì đổi hash", () => {
        const a = layout();
        const reversed = MapLayoutSchema.parse(Object.fromEntries(Object.entries(a).reverse()));
        assert.equal(hashMapLayout(a), hashMapLayout(reversed));
        assert.notEqual(
            hashMapLayout(a),
            hashMapLayout(layout({ npcs: [{ id: "npc_a", x: 9, y: 9 }] }))
        );
    });

    it("layout từ chối id trùng, marker ra ngoài map, collider ra ngoài", () => {
        assert.throws(() =>
            layout({
                monsters: [
                    { id: "g1", x: 1, y: 1 },
                    { id: "g1", x: 2, y: 2 },
                ],
            })
        );
        assert.throws(() => layout({ npcs: [{ id: "npc_a", x: 99, y: 1 }] }));
        assert.throws(() => layout({ colliders: [{ x: 19, y: 0, w: 5, h: 1 }] }));
    });

    it("định nghĩa: đúng 1 spawn default, dungeon ⇔ có khối dungeon, id marker không trùng", () => {
        assert.throws(() => definition({ spawnPoints: [{ id: "a", kind: MapSpawnKind.RESPAWN }] }));
        assert.throws(() => definition({ type: MapType.DUNGEON }));
        assert.throws(() =>
            definition({
                monsterGroups: [
                    { markerId: "g1", members: [{ monsterCode: "slime", count: 1 }] },
                    { markerId: "g1", members: [{ monsterCode: "bat", count: 1 }] },
                ],
            })
        );
        assert.throws(() => definition({ monsterLevel: { min: 5, max: 2 } }));
    });

    it("marker thiếu vị trí bị bỏ qua và liệt kê; marker lạ trong layout bị từ chối", () => {
        const def = definition();
        const partial = buildMapRow(def, layout({ monsters: [], interactables: [] }), "h");
        assert.deepEqual(partial.missing.sort(), ["interactable:gate", "monster:g1"]);
        assert.deepEqual(partial.row.monsterSpawns, []);
        assert.deepEqual(partial.row.missingMarkers?.sort(), ["interactable:gate", "monster:g1"]);
        const errors = validateLayoutAgainstDefinition(
            def,
            layout({ monsters: [{ id: "zzz", x: 1, y: 1 }] })
        );
        assert.equal(errors.length, 1);
        assert.match(errors[0], /zzz/);
    });
});

describe("nhóm quái", () => {
    const group = {
        markerId: "g1",
        members: [
            { monsterCode: "slime", count: 2 },
            { monsterCode: "bat", count: 2 },
        ],
    };

    it("trải quanh marker: hàng 3 con căn giữa, hàng sau nằm dưới, mỗi con count 1", () => {
        const spawns = expandMonsterGroup(group, 10, 10);
        assert.equal(spawns.length, 4);
        assert.ok(spawns.every((spawn) => spawn.count === 1 && spawn.groupId === "g1"));
        assert.deepEqual(
            spawns.map((s) => [s.monsterCode, s.spawnX, s.spawnY]),
            [
                ["slime", 8, 10],
                ["slime", 10, 10],
                ["bat", 12, 10],
                ["bat", 10, 12],
            ]
        );
    });

    it("nhóm hỗn hợp: level riêng của thành viên thắng level mặc định của map", () => {
        const def = definition();
        const { row } = buildMapRow(def, layout(), "h");
        const slimes = row.monsterSpawns!.filter((s) => s.monsterCode === "slime");
        const bats = row.monsterSpawns!.filter((s) => s.monsterCode === "bat");
        assert.ok(slimes.every((s) => s.minLevel === 2 && s.maxLevel === 4 && s.type === "random"));
        assert.ok(bats.every((s) => s.minLevel === 6 && s.maxLevel === 7));
    });
});

describe("dungeon từ định nghĩa", () => {
    const dungeonDef = () => loadMapDefinitions().find((d) => d.code === "werewolf_den")!;

    it("danh sách marker xuất cho Unity gồm nhóm quái từng phase và hình học chamber", () => {
        const list = mapMarkerList(dungeonDef());
        assert.equal(list.chambers.length, 3);
        assert.equal(list.chambers[2].isBoss, true);
        assert.equal(list.chambers[2].hasExit, false);
        assert.ok(list.monsters.some((m) => m.id === "c3_boss"));
        assert.ok(list.monsters.every((m) => m.members.length > 0));
    });

    it("thiếu hình học / marker thì dungeon chưa chơi được (chambers rỗng) và liệt kê thiếu", () => {
        const def = dungeonDef();
        const built = buildMapRow(
            def,
            parseMapLayout({
                code: def.code,
                width: 50,
                height: 50,
                spawnPoints: [{ id: "from_forest", x: 1, y: 1 }],
            }),
            "h"
        );
        assert.deepEqual(built.row.dungeon?.chambers, []);
        assert.ok(built.missing.includes("chamber:c1"));
        assert.ok(built.missing.includes("monster:c1_p1"));
    });

    it("đủ marker thì sinh chamber với phase, spawn và cổng exit", () => {
        const def = dungeonDef();
        const markers = mapMarkerList(def);
        const chambers = markers.chambers.map((c, i) => ({
            id: c.id,
            bounds: { x: i * 10, y: 0, w: 9, h: 9 },
            entry: { x: i * 10 + 1, y: 1 },
            ...(c.hasExit ? { exit: { x: i * 10 + 8, y: 8 } } : {}),
        }));
        const built = buildMapRow(
            def,
            parseMapLayout({
                code: def.code,
                width: 60,
                height: 20,
                spawnPoints: [
                    { id: "default", x: 1, y: 1 },
                    { id: "from_forest", x: 1, y: 1 },
                ],
                monsters: markers.monsters.map((m, i) => ({ id: m.id, x: 2 + (i % 20), y: 3 })),
                chambers,
            }),
            "h"
        );
        assert.deepEqual(built.missing, []);
        const config = built.row.dungeon!;
        assert.equal(config.chambers.length, 3);
        assert.equal(config.chambers[0].exit?.radius, 1.5);
        assert.equal(config.chambers[2].exit, undefined);
        assert.equal(config.chambers[2].isBoss, true);
        const boss = config.chambers[2].phases[0].monsterSpawns.find((s) => s.type === "boss");
        assert.equal(boss?.monsterCode, "werewolf");
        assert.ok(config.chambers[1].phases[1].monsterSpawns.some((s) => s.type === "elite"));
    });
});

describe("tham chiếu giữa các map", () => {
    it("portal phải trỏ tới map và spawn có thật, id vật thể không trùng giữa map", () => {
        const a = definition({ code: "a" });
        const b = definition({ code: "b", interactables: [], monsterGroups: [] });
        const badTarget = definition({
            code: "a",
            interactables: [
                { id: "gate", type: "portal", targetMapCode: "b", targetSpawnId: "nope" },
            ],
        });
        assert.equal(validateDefinitionRefs([badTarget, b]).length, 1);
        assert.equal(validateDefinitionRefs([a]).length, 1); // "gate" trỏ map "t" không có
        const dup = definition({ code: "c" });
        assert.ok(
            validateDefinitionRefs([definition({ code: "a" }), dup]).some((e) =>
                e.includes("trùng")
            )
        );
    });

    it("placeholder có đủ id spawn để portal tham chiếu", () => {
        const row = buildPlaceholderRow(definition());
        assert.deepEqual(
            row.spawnPoints?.map((p) => p.id),
            ["default", "respawn"]
        );
    });
});

describe("teleport (dịch chuyển nhanh)", () => {
    const maps = (extra: Partial<Parameters<typeof listTeleportDestinations>[0][number]>[] = []) =>
        [
            {
                code: "village",
                type: "town",
                minLevel: 1,
                interactables: [{ id: "tp_v", type: "teleport", x: 5, y: 6 }],
            },
            {
                code: "forest",
                type: "field",
                minLevel: 10,
                interactables: [{ id: "tp_f", type: "teleport", x: 1, y: 2 }],
            },
            {
                code: "plains",
                type: "field",
                minLevel: 1,
                interactables: [{ id: "g", type: "portal", x: 1, y: 1 }],
            },
            {
                code: "den",
                type: "dungeon",
                minLevel: 10,
                interactables: [{ id: "tp_d", type: "teleport", x: 1, y: 1 }],
            },
            ...extra,
        ] as Parameters<typeof listTeleportDestinations>[0];

    it("điểm đến = mọi map trừ dungeon và map hiện tại, sắp theo level", () => {
        assert.deepEqual(
            listTeleportDestinations(maps(), "village").map((d) => d.mapCode),
            ["plains", "forest"]
        );
        assert.deepEqual(
            listTeleportDestinations(maps(), "plains").map((d) => d.mapCode),
            ["village", "forest"]
        );
    });

    it("trả về bệ và vị trí để đặt player", () => {
        const forest = listTeleportDestinations(maps(), "village").find(
            (d) => d.mapCode === "forest"
        )!;
        assert.deepEqual(
            [forest.teleportId, forest.x, forest.y, forest.minLevel],
            ["tp_f", 1, 2, 10]
        );
    });

    it("map chưa có bệ teleport vẫn có trong danh sách nhưng chưa mở", () => {
        const plains = listTeleportDestinations(maps()).find((d) => d.mapCode === "plains");
        assert.equal(plains?.open, false);
        assert.equal(plains?.teleportId, undefined);
    });

    it("map có bệ nhưng chưa active cũng chưa mở", () => {
        const inactive = maps([
            {
                code: "ruins",
                type: "field",
                minLevel: 5,
                status: "inactive",
                interactables: [{ id: "tp_r", type: "teleport", x: 1, y: 1 }],
            },
        ]);
        assert.equal(
            listTeleportDestinations(inactive).find((d) => d.mapCode === "ruins")?.open,
            false
        );
    });

    it("định nghĩa teleport không cần đích; row giữ vị trí bệ", () => {
        const def = definition({
            monsterGroups: [],
            npcs: [],
            interactables: [{ id: "tp", type: "teleport" }],
        });
        const { row, missing } = buildMapRow(
            def,
            layout({ monsters: [], npcs: [], interactables: [{ id: "tp", x: 7, y: 8 }] }),
            "h"
        );
        assert.deepEqual(missing, []);
        assert.deepEqual(
            [row.interactables?.[0].type, row.interactables?.[0].x, row.interactables?.[0].y],
            ["teleport", 7, 8]
        );
    });

    it("map trong repo: các map không phải dungeon đều khai bệ teleport", () => {
        for (const def of loadMapDefinitions()) {
            const has = def.interactables.some((it) => it.type === "teleport");
            assert.equal(has, def.type !== MapType.DUNGEON, def.code);
        }
    });
});

describe("teleport: phải đến map đó trước", () => {
    const destination = { mapCode: "whispering_forest", minLevel: 10 };

    it("đánh dấu theo flag visited.<map>", () => {
        assert.equal(visitedFlagKey("whispering_forest"), "visited.whispering_forest");
        assert.equal(hasVisited({}, "whispering_forest"), false);
        assert.equal(hasVisited({ "visited.whispering_forest": true }, "whispering_forest"), true);
        assert.equal(hasVisited({ "visited.other": true }, "whispering_forest"), false);
    });

    it("chưa đến thì không teleport được dù đủ level", () => {
        assert.deepEqual(teleportStatus(destination, 50, {}), {
            discovered: false,
            levelOk: true,
            available: false,
        });
    });

    it("đã đến nhưng thiếu level cũng chưa được", () => {
        const flags = { "visited.whispering_forest": true };
        assert.deepEqual(teleportStatus(destination, 5, flags), {
            discovered: true,
            levelOk: false,
            available: false,
        });
    });

    it("chưa mở (không có bệ) thì không teleport được dù đã đến và đủ level", () => {
        const flags = { "visited.whispering_forest": true };
        assert.equal(teleportStatus({ ...destination, open: false }, 50, flags).available, false);
    });

    it("đã đến và đủ level thì teleport được", () => {
        const flags = { "visited.whispering_forest": true };
        assert.equal(teleportStatus(destination, 10, flags).available, true);
    });

    it("map openToAll: chưa từng đến vẫn teleport được, vẫn kiểm level", () => {
        const open = { mapCode: "training_room", minLevel: 1, openToAll: true };
        assert.deepEqual(teleportStatus(open, 1, {}), {
            discovered: true,
            levelOk: true,
            available: true,
        });
        assert.equal(teleportStatus({ ...open, minLevel: 5 }, 1, {}).available, false);
        assert.equal(teleportStatus({ ...open, open: false }, 1, {}).available, false);
    });

    it("bệ teleport khai openToAll thì điểm đến mang cờ đó", () => {
        const list = listTeleportDestinations(
            [
                {
                    code: "training_room",
                    type: "field",
                    minLevel: 1,
                    interactables: [{ id: "tp_t", type: "teleport", x: 3, y: 4, openToAll: true }],
                },
                {
                    code: "forest",
                    type: "field",
                    minLevel: 10,
                    interactables: [{ id: "tp_f", type: "teleport", x: 1, y: 2 }],
                },
            ] as Parameters<typeof listTeleportDestinations>[0],
            "village"
        );
        assert.equal(list.find((d) => d.mapCode === "training_room")?.openToAll, true);
        assert.equal(list.find((d) => d.mapCode === "forest")?.openToAll, undefined);
    });
});
