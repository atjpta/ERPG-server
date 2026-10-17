import { strict as assert } from "node:assert";
import { EntityBodiesSchema } from "@/modules/bodies/schemas/entity-bodies.schema.js";
import {
    classBody,
    monsterBody,
    npcCollider,
} from "@/modules/bodies/services/entity-body.service.js";
import { NPCS } from "@/modules/npcs/seeds/npc.seed-data.js";
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

    it("gives every npc a foot collider", () => {
        for (const npc of NPCS) {
            const { width, height } = npcCollider(npc.code);
            assert.ok(width > 0 && height > 0, npc.code);
        }
        assert.throws(() => npcCollider("no_such_npc"), /No collider for npc/);
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
