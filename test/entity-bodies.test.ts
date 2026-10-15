import { strict as assert } from "node:assert";
import { EntityBodiesSchema } from "@/modules/bodies/schemas/entity-bodies.schema.js";
import { classBody, monsterBody } from "@/modules/bodies/utils/entity-body.util.js";
import { MONSTER_DEFINITIONS } from "@/modules/monsters/seeds/monster.seed-data.js";

describe("entity bodies (exported from the Unity prefabs)", () => {
    it("gives every monster definition a hitbox and a collider", () => {
        for (const monster of MONSTER_DEFINITIONS) {
            assert.ok(monster.hitbox.width > 0 && monster.hitbox.height > 0, monster.code);
            assert.ok(monster.collider.width > 0 && monster.collider.height > 0, monster.code);
        }
    });

    it("throws for a monster Unity did not export", () => {
        assert.throws(() => monsterBody("no_such_monster"), /No body for monster/);
    });

    it("falls back to the base class body", () => {
        const base = classBody("swordsman");
        assert.ok(base, "swordsman body");
        assert.deepEqual(classBody("some_tier_2_class", "swordsman"), base);
        assert.equal(classBody("some_tier_2_class"), undefined);
    });

    it("rejects a body without a size", () => {
        const bad = {
            monsters: { x: { hitbox: { width: 0, height: 1 }, collider: { width: 1, height: 1 } } },
            classes: {},
        };
        assert.equal(EntityBodiesSchema.safeParse(bad).success, false);
    });
});
