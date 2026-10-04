import assert from "node:assert/strict";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import type { Stats } from "@/modules/player/schemas/stat.schema.js";
import {
    DamageScalingType,
    DamageType,
    SkillEffectType,
} from "@/modules/skills/enums/skill.enum.js";
import type { SkillHitEvent } from "@/modules/skills/schemas/skill-config.schema.js";
import { calculateDamage, type DamageCombatant } from "@/rooms/world/chains/damage.world.chain.js";
import { combatRoll, fnv1a32 } from "@/rooms/world/utils/combat-roll.world.util.js";

/** Hit event tối giản: chỉ `effects` được chain đọc. */
const createEvent = (
    effects: { baseValue?: number; scalingValue?: number; damageType?: DamageType }[]
): SkillHitEvent =>
    ({
        effects: effects.map((effect) => ({
            effectType: SkillEffectType.DAMAGE,
            baseValue: effect.baseValue ?? 0,
            scalingType: DamageScalingType.ATTACK,
            scalingValue: effect.scalingValue ?? 1,
            damageType: effect.damageType ?? DamageType.PHYSICAL,
        })),
    }) as unknown as SkillHitEvent;

const combatant = (stats: Stats, extra: Partial<DamageCombatant> = {}): DamageCombatant => ({
    id: "unit",
    stats,
    hp: 1000,
    maxHp: 1000,
    ...extra,
});

/** Accuracy cao + không chí mạng → luôn trúng, kết quả không phụ thuộc roll. */
const sureHit: Stats = { [StatKey.PHYSICAL_ATTACK]: 100, [StatKey.ACCURACY]: 1000 };

/** Tìm seed cho ra roll nằm trong khoảng mong muốn (test tất định). */
const findSeed = (salt: string, predicate: (roll: number) => boolean) => {
    for (let index = 0; index < 10_000; index++) {
        const seed = `seed-${index}`;
        if (predicate(combatRoll(seed, salt).toNumber())) return seed;
    }
    throw new Error("no seed found");
};

describe("damage.world.chain — calculateDamage", () => {
    it("FNV-1a 32-bit khớp giá trị chuẩn (bản C# phải ra cùng số)", () => {
        assert.equal(fnv1a32(""), 0x811c9dc5);
        assert.equal(fnv1a32("a"), 0xe40c292c);
        assert.equal(fnv1a32("foobar"), 0xbf9cf968);
    });

    it("giáp giảm theo 100 / (100 + giáp)", () => {
        const result = calculateDamage({
            attacker: combatant(sureHit),
            defender: combatant({ [StatKey.PHYSICAL_DEFENSE]: 100 }),
            event: createEvent([{ scalingValue: 1 }]),
            seed: "s",
        });
        assert.deepEqual(result, { hit: true, critical: false, damage: 50, heal: 0 });
    });

    it("xuyên giáp bỏ qua một phần giáp; TRUE damage bỏ qua hoàn toàn", () => {
        const defender = combatant({ [StatKey.PHYSICAL_DEFENSE]: 100 });
        const pierced = calculateDamage({
            attacker: combatant({ ...sureHit, [StatKey.PHYSICAL_PENETRATION]: 0.5 }),
            defender,
            event: createEvent([{}]),
            seed: "s",
        });
        assert.equal(pierced.damage, Math.floor((100 * 100) / 150));

        const trueDamage = calculateDamage({
            attacker: combatant(sureHit),
            defender,
            event: createEvent([{ damageType: DamageType.TRUE }]),
            seed: "s",
        });
        assert.equal(trueDamage.damage, 100);
    });

    it("MAGICAL dùng magic_defense, không dùng physical_defense", () => {
        const result = calculateDamage({
            attacker: combatant(sureHit),
            defender: combatant({ [StatKey.PHYSICAL_DEFENSE]: 1000, [StatKey.MAGIC_DEFENSE]: 0 }),
            event: createEvent([
                { damageType: DamageType.MAGICAL, baseValue: 40, scalingValue: 0 },
            ]),
            seed: "s",
        });
        assert.equal(result.damage, 40);
    });

    it("trượt khi roll ≥ tỉ lệ trúng (kẹp tối thiểu 50%)", () => {
        const seed = findSeed("hit", (roll) => roll >= 0.5);
        const result = calculateDamage({
            attacker: combatant({ [StatKey.PHYSICAL_ATTACK]: 100 }),
            defender: combatant({ [StatKey.EVASION]: 1000 }),
            event: createEvent([{}]),
            seed,
        });
        assert.deepEqual(result, { hit: false, critical: false, damage: 0, heal: 0 });
    });

    it("chí mạng nhân critical_damage", () => {
        const seed = findSeed("critical", (roll) => roll < 0.5);
        const result = calculateDamage({
            attacker: combatant({
                ...sureHit,
                [StatKey.CRITICAL_CHANCE]: 0.5,
                [StatKey.CRITICAL_DAMAGE]: 2,
            }),
            defender: combatant({}),
            event: createEvent([{}]),
            seed,
        });
        assert.equal(result.critical, true);
        assert.equal(result.damage, 200);
    });

    it("damage_to_monsters + damage_to_bosses cộng dồn khi đánh boss, không áp lên player", () => {
        const attacker = combatant({
            ...sureHit,
            [StatKey.DAMAGE_TO_MONSTERS]: 0.1,
            [StatKey.DAMAGE_TO_BOSSES]: 0.2,
        });
        const event = createEvent([{}]);
        const boss = calculateDamage({
            attacker,
            defender: combatant({}, { monsterType: MonsterType.BOSS }),
            event,
            seed: "s",
        });
        const normal = calculateDamage({
            attacker,
            defender: combatant({}, { monsterType: MonsterType.NORMAL }),
            event,
            seed: "s",
        });
        const player = calculateDamage({ attacker, defender: combatant({}), event, seed: "s" });
        assert.equal(boss.damage, 130);
        assert.equal(normal.damage, 110);
        assert.equal(player.damage, 100);
    });

    it("tối thiểu 1, không vượt HP còn lại; hút máu tính trên damage thực", () => {
        const weak = calculateDamage({
            attacker: combatant({ [StatKey.ACCURACY]: 1000, [StatKey.PHYSICAL_ATTACK]: 1 }),
            defender: combatant({ [StatKey.PHYSICAL_DEFENSE]: 10_000 }),
            event: createEvent([{}]),
            seed: "s",
        });
        assert.equal(weak.damage, 1);

        const overkill = calculateDamage({
            attacker: combatant({ ...sureHit, [StatKey.LIFE_STEAL]: 0.5 }),
            defender: combatant({}, { hp: 30 }),
            event: createEvent([{}]),
            seed: "s",
        });
        assert.deepEqual(overkill, { hit: true, critical: false, damage: 30, heal: 15 });
    });

    it("cùng seed → cùng kết quả", () => {
        const props = {
            attacker: combatant({ [StatKey.PHYSICAL_ATTACK]: 100, [StatKey.CRITICAL_CHANCE]: 0.5 }),
            defender: combatant({ [StatKey.EVASION]: 20 }),
            event: createEvent([{}]),
            seed: "player:3:0:monster",
        };
        assert.deepEqual(calculateDamage(props), calculateDamage(props));
    });

    it("combat roll chỉ có 4 chữ số thập phân", () => {
        const roll = combatRoll("player:1:0:monster", "hit");
        assert.ok(roll.decimalPlaces()! <= 4);
    });
});
