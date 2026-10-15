import { strict as assert } from "node:assert";
import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import {
    MonsterDefaultsSchema,
    MonsterFileSchema,
    resolveMonster,
} from "@/modules/monsters/schemas/monster-file.schema.js";
import {
    loadMonsterDefaults,
    loadMonsterFiles,
    loadResolvedMonsters,
} from "@/modules/monsters/seeds/monster-file.util.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";

const defaults = MonsterDefaultsSchema.parse({
    level: 1,
    attackCooldownMs: 1700,
    stats: { [StatKey.MAX_HP]: 50, [StatKey.PHYSICAL_ATTACK]: 5 },
    drops: { exp: 22, gold: { min: 1, max: 10 }, items: [] },
});

const file = (extra: Record<string, unknown> = {}) =>
    MonsterFileSchema.parse({ code: "test_mob", biome: Biome.SLIME, ...extra });

describe("monster files (authored in the Unity Monster Lab)", () => {
    it("takes everything from the defaults when the monster lists nothing", () => {
        const monster = resolveMonster(file(), defaults);
        assert.equal(monster.level, 1);
        assert.equal(monster.attackCooldownMs, 1700);
        assert.deepEqual(monster.stats, { [StatKey.MAX_HP]: 50, [StatKey.PHYSICAL_ATTACK]: 5 });
        assert.equal(monster.drops.exp, 22);
    });

    it("replaces only the numbers the monster lists", () => {
        const monster = resolveMonster(
            file({ level: 20, stats: { [StatKey.MAX_HP]: 500, [StatKey.PHYSICAL_DEFENSE]: 1 } }),
            defaults
        );
        assert.equal(monster.level, 20);
        assert.equal(monster.attackCooldownMs, 1700);
        assert.deepEqual(monster.stats, {
            [StatKey.MAX_HP]: 500,
            [StatKey.PHYSICAL_ATTACK]: 5,
            [StatKey.PHYSICAL_DEFENSE]: 1,
        });
    });

    it("can set a default stat to 0 for one monster", () => {
        const monster = resolveMonster(file({ stats: { [StatKey.PHYSICAL_ATTACK]: 0 } }), defaults);
        assert.equal(monster.stats[StatKey.PHYSICAL_ATTACK], 0);
    });

    it("replaces the drops as a whole", () => {
        const monster = resolveMonster(file({ drops: { exp: 400, items: [] } }), defaults);
        assert.equal(monster.drops.exp, 400);
        assert.equal(monster.drops.gold, undefined);
    });

    it("rejects an unknown stat key or biome", () => {
        assert.throws(() => file({ stats: { not_a_stat: 1 } }));
        assert.throws(() => file({ biome: "volcano" }));
    });

    it("loads every real monster file on top of valid defaults", () => {
        assert.ok(loadMonsterDefaults().stats[StatKey.MAX_HP] > 0);
        const files = loadMonsterFiles();
        assert.ok(files.length > 0);
        assert.equal(loadResolvedMonsters().length, files.length);
        for (const monster of loadResolvedMonsters()) {
            assert.ok(monster.stats[StatKey.MAX_HP] > 0, monster.code);
        }
    });
});
