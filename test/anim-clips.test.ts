import { strict as assert } from "node:assert";
import { AnimClipsSchema } from "@/modules/bodies/schemas/anim-clips.schema.js";
import {
    loadAnimClips,
    monsterAttackMs,
    skillClipWarnings,
} from "@/modules/bodies/utils/anim-clip.util.js";
import { MONSTER_DEFINITIONS } from "@/modules/monsters/seeds/monster.seed-data.js";

const clips = AnimClipsSchema.parse({
    skills: { archer_basic_attack: { lengthMs: 750 } },
    monsters: {},
});
const skill = (animationMs: number, triggerTicks: number) => ({
    code: "archer_basic_attack",
    animationMs,
    castTimeMs: 0,
    skillHitEvents: [{ triggerTicks }],
});

describe("anim clips (exported from the Unity prefabs)", () => {
    it("lasts exactly as long as the Attack1 clip for every monster", () => {
        for (const monster of MONSTER_DEFINITIONS) {
            assert.equal(monster.attackClipMs, monsterAttackMs(monster.code), monster.code);
        }
        assert.ok(Object.keys(loadAnimClips().skills).length > 0);
    });

    it("accepts a skill shorter than its clip (tuning)", () => {
        assert.deepEqual(skillClipWarnings([skill(660, 12)], clips), []);
    });

    it("warns when a skill outlasts its clip or a hit lands after it", () => {
        assert.equal(skillClipWarnings([skill(900, 12)], clips).length, 1);
        assert.equal(skillClipWarnings([skill(700, 20)], clips).length, 1);
    });

    it("ignores a skill without a clip", () => {
        assert.deepEqual(skillClipWarnings([{ ...skill(9999, 99), code: "no_clip" }], clips), []);
    });
});
