import { strict as assert } from "node:assert";
import { HitDelivery, SkillType } from "@/modules/skills/enums/skill.enum.js";
import { SkillFileSchema } from "@/modules/skills/schemas/skill-file.schema.js";
import { skillFileToRow, withFileSkills } from "@/modules/skills/seeds/skill-file.util.js";

const file = (extra: Record<string, unknown> = {}) =>
    SkillFileSchema.parse({
        code: "archer_volley",
        classCode: "archer",
        skillType: SkillType.PROJECTILE,
        castRange: 6,
        animationMs: 750,
        levels: { start: 1.1, step: 0.1 },
        cooldownMs: 4000,
        manaCost: 5,
        hits: [
            {
                triggerTicks: 10,
                shape: "CIRCLE",
                radius: 0.2,
                damageScaling: 1.5,
                delivery: HitDelivery.PROJECTILE,
                projectile: { speed: 12, maxDistance: 6 },
            },
        ],
        ...extra,
    });

describe("skill files (authored in the Unity Skill Lab)", () => {
    it("turns a file into a skills row with a damage effect and the level table", () => {
        const row = skillFileToRow(file());
        assert.equal(row.code, "archer_volley");
        assert.equal(row.levelConfig?.length, 10);
        assert.equal(row.levelConfig?.[0].scalingValue, 1.1);
        assert.equal(row.levelConfig?.[9].scalingValue, 2);
        const hit = row.skillHitEvents?.[0];
        assert.equal(hit?.eventIndex, 0);
        assert.equal(hit?.delivery, HitDelivery.PROJECTILE);
        assert.equal(hit?.projectile?.speed, 12);
        assert.equal(hit?.effects.length, 1);
    });

    it("does not level a skill without a level table, and keeps an explicit one", () => {
        assert.deepEqual(skillFileToRow(file({ levels: undefined })).levelConfig, []);
        const explicit = [{ level: 1, baseValue: 2, scalingType: "ATTACK", scalingValue: 0.25 }];
        const row = skillFileToRow(file({ levelConfig: explicit }));
        assert.equal(row.levelConfig?.length, 1);
        assert.equal(row.levelConfig?.[0].baseValue, 2);
    });

    it("lets a shared skill (the dash) have no class", () => {
        const dash = file({ code: "dash", classCode: undefined, skillType: SkillType.DASH });
        assert.equal(dash.classCode, undefined);
        assert.deepEqual(withFileSkills("archer", [], [dash]), []);
    });

    it("adds a stun and a knockback as effects", () => {
        const row = skillFileToRow(
            file({
                hits: [
                    {
                        triggerTicks: 4,
                        range: 1,
                        width: 1,
                        stunMs: 600,
                        knockback: { distance: 2, durationMs: 300 },
                    },
                ],
            })
        );
        assert.equal(row.skillHitEvents?.[0].effects.length, 3);
    });

    it("lets an aura or an ally heal carry its own numbers instead of damage", () => {
        const aura = skillFileToRow(
            file({
                hits: [
                    {
                        triggerTicks: 0,
                        delivery: HitDelivery.AURA,
                        aura: { durationMs: 8000, radiusX: 2, radiusY: 1 },
                    },
                ],
            })
        );
        assert.deepEqual(aura.skillHitEvents?.[0].effects, []);
        assert.equal(aura.skillHitEvents?.[0].aura?.radiusX, 2);
    });

    it("rejects a hit without the block its delivery needs", () => {
        assert.throws(
            () =>
                file({
                    hits: [{ triggerTicks: 1, delivery: HitDelivery.PROJECTILE }],
                }),
            /needs its .*projectile.* block/
        );
    });

    it("rejects a code that is not lower snake case", () => {
        assert.throws(() => file({ code: "Archer-Volley" }));
    });

    it("puts file skills into the class order by slot, the rest last", () => {
        const seeded = ["archer_basic_attack", "archer_piercing_arrow", "archer_rain_arrows"];
        const sloted = file({ slot: 1 });
        const last = file({ code: "archer_last", hits: [] });
        assert.deepEqual(withFileSkills("archer", seeded, [last, sloted]), [
            "archer_basic_attack",
            "archer_volley",
            "archer_piercing_arrow",
            "archer_rain_arrows",
            "archer_last",
        ]);
        assert.deepEqual(withFileSkills("cleric", seeded, [sloted]), seeded);
    });
});
