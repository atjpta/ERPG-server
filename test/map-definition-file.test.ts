import { strict as assert } from "node:assert";
import { MapSpawnKind } from "@/modules/maps/entities/game-map.entity.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { MapDefinitionSchema } from "@/modules/maps/schemas/map-definition.schema.js";
import { loadMapDefinitionFiles, loadMapDefinitions } from "@/modules/maps/seeds/game-map.seed.js";
import { validateDefinitionRefs } from "@/modules/maps/utils/map-build.util.js";

const definition = (code: string, extra: Record<string, unknown> = {}) =>
    MapDefinitionSchema.parse({
        code,
        type: MapType.FIELD,
        spawnPoints: [{ id: "default", kind: MapSpawnKind.DEFAULT }],
        ...extra,
    });

describe("map definition files (created in the Unity Map Lab)", () => {
    it("loads every definitions/*.json, all valid together", () => {
        const files = loadMapDefinitionFiles();
        const all = loadMapDefinitions();
        assert.equal(all.length, files.length);
        assert.ok(all.some((map) => map.code === "greenfield_village"));
        assert.deepEqual(validateDefinitionRefs(all), []);
    });

    it("fills the defaults of a minimal field map", () => {
        const map = definition("lab_field");
        assert.equal(map.minLevel, 1);
        assert.equal(map.maxPlayersPerChannel, 100);
        assert.deepEqual(map.monsterGroups, []);
    });

    it("needs exactly one default spawn in a field map", () => {
        assert.throws(() => definition("lab_field", { spawnPoints: [] }));
        assert.throws(() =>
            definition("lab_field", {
                spawnPoints: [
                    { id: "a", kind: MapSpawnKind.DEFAULT },
                    { id: "b", kind: MapSpawnKind.DEFAULT },
                ],
            })
        );
    });

    it("flags a duplicate code and a portal to a spawn that does not exist", () => {
        const a = definition("lab_a");
        const portal = definition("lab_b", {
            interactables: [
                {
                    id: "lab_portal",
                    type: "portal",
                    targetMapCode: "lab_a",
                    targetSpawnId: "nowhere",
                },
            ],
        });
        assert.ok(validateDefinitionRefs([a, a]).some((error) => error.includes("trùng")));
        assert.ok(
            validateDefinitionRefs([a, portal]).some((error) => error.includes("unknown spawn"))
        );
    });
});
