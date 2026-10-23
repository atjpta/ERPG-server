import { calculateDamage, type DamageCombatant } from "@/modules/combat/chains/damage.chain.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { equipmentUpgradeService } from "@/modules/equipment/services/equipment-upgrade.service.js";
import { EquipmentGroup } from "@/modules/items/enums/item-equipment.enum.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";
import { MonsterRepo } from "@/modules/monsters/repositories/monster.repository.js";
import { monsterStatService } from "@/modules/monsters/services/monster-stat.service.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import { ATTRIBUTE_KEYS, type Stats } from "@/modules/player/schemas/stat.schema.js";
import { playerStatService } from "@/modules/player/services/player-stat.service.js";
import { skillService } from "@/modules/skills/services/skill.service.js";
import { CalcService, calcService } from "@/core/calc/calc.service.js";
import type { ICalcDriver } from "@/core/calc/calc.interface.js";
import { check, checkEqual, test } from "./harness.js";

const native = new CalcService("native");
const big = new CalcService("big");

/** Chạy `fn` với từng driver và trả kết quả của cả hai (luôn trả `calc` về native). */
const underBoth = <T>(fn: () => T): [T, T] => {
    try {
        return [native, big].map((driver: ICalcDriver) => {
            calcService.use(driver);
            return fn();
        }) as [T, T];
    } finally {
        calcService.use(native);
    }
};

const rng = (seed: number) => {
    let state = seed >>> 0 || 1;
    return () => {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 2 ** 32;
    };
};

/** Bộ stat ngẫu nhiên: giá trị 0–4 chữ số thập phân, tỉ lệ (chí mạng, xuyên giáp, hút máu) trong [0, 1]. */
const randomStats = (random: () => number): Stats => {
    const ratio = new Set<string>([
        StatKey.CRITICAL_CHANCE,
        StatKey.PHYSICAL_PENETRATION,
        StatKey.MAGIC_PENETRATION,
        StatKey.LIFE_STEAL,
    ]);
    const stats: Stats = {};
    for (const key of Object.values(StatKey)) {
        if (random() < 0.15) continue;
        const raw = ratio.has(key) ? random() : random() * 3000;
        stats[key] = Math.round(raw * 10_000) / 10_000;
    }
    return stats;
};

test("calc: damage chain — mọi hit event của mọi skill cho kết quả giống nhau ở hai driver", async () => {
    const random = rng(7_001);
    const skills = skillService.getAll();
    check(skills.length > 0, "skills are cached");
    let events = 0;
    for (const skill of skills) {
        for (const event of skill.skillHitEvents) {
            for (let round = 0; round < 60; round++) {
                const combatant = (id: string, monsterType?: MonsterType): DamageCombatant => {
                    const maxHp = 50 + Math.floor(random() * 20_000);
                    return {
                        id,
                        stats: randomStats(random),
                        hp: 1 + Math.floor(random() * maxHp),
                        maxHp,
                        monsterType,
                    };
                };
                const attacker = combatant("a", random() < 0.3 ? MonsterType.NORMAL : undefined);
                const defender = combatant(
                    "d",
                    random() < 0.5
                        ? [MonsterType.NORMAL, MonsterType.ELITE, MonsterType.BOSS][
                              Math.floor(random() * 3)
                          ]
                        : undefined
                );
                const seed = `${skill.code}:${round}:${Math.floor(random() * 1e9)}`;
                const [a, b] = underBoth(() =>
                    calculateDamage({ attacker, defender, event, seed })
                );
                checkEqual(a, b, `${skill.code} #${round}`);
            }
            events++;
        }
    }
    check(events > 0, "at least one hit event was compared");
});

test("calc: chỉ số class / monster / chi phí nâng cấp giống nhau ở hai driver", async () => {
    const random = rng(7_002);

    // Chỉ số class × điểm thuộc tính đã cộng.
    for (const characterClass of classService.listAll()) {
        for (let round = 0; round < 40; round++) {
            const allocatedAttributes = Object.fromEntries(
                ATTRIBUTE_KEYS.map((key) => [key, Math.floor(random() * 300)])
            ) as never;
            const [a, b] = underBoth(() =>
                playerStatService.compute({
                    classId: characterClass.id,
                    allocatedAttributes,
                    equipments: {} as never,
                })
            );
            checkEqual(a, b, `class ${characterClass.code} #${round}`);
        }
    }

    // Chỉ số monster theo level × loại × độ hiếm.
    const levelConfig = masterDataCacheService.get(MasterDataKey.MONSTER_LEVEL_CONFIG);
    const scaleConfig = masterDataCacheService.get(MasterDataKey.MONSTER_SCALE_CONFIG);
    let maxMonster = 0;
    for (const monster of await MonsterRepo.findAll()) {
        for (const level of [1, 2, 5, 10, 25, 50, 75, 100]) {
            for (const type of Object.keys(scaleConfig.byType)) {
                for (const rarity of Object.keys(scaleConfig.byRarity)) {
                    const variant = { type, rarity } as never;
                    const [a, b] = underBoth(() => {
                        const scales = monsterStatService.monsterScales(variant, scaleConfig);
                        const reward = monsterStatService.combineRewardScale(scales);
                        return {
                            stats: monsterStatService.computeMonsterStats(
                                monster,
                                level,
                                levelConfig,
                                scales
                            ),
                            size: monsterStatService.combineSize(scales),
                            exp: reward.exp.toNumber(),
                            gold: reward.gold.toNumber(),
                            dropRate: reward.dropRate.toNumber(),
                        };
                    });
                    checkEqual(a, b, `${monster.code} L${level} ${type}/${rarity}`);
                    for (const value of Object.values(a.stats)) {
                        maxMonster = Math.max(maxMonster, Math.abs(value));
                    }
                }
            }
        }
    }
    check(maxMonster > 0, `monster stats were compared (max ${maxMonster})`);

    // Chi phí cường hoá / tinh hoá theo từng cấp, độ hiếm, nhóm và level.
    const enhance = masterDataCacheService.get(MasterDataKey.EQUIPMENT_ENHANCE_CONFIG);
    const refine = masterDataCacheService.get(MasterDataKey.EQUIPMENT_REFINE_CONFIG);
    for (const group of Object.values(EquipmentGroup)) {
        for (const rarity of Object.values(ItemRarity)) {
            for (const level of [1, 5, 10, 20, 40, 60, 80, 100]) {
                for (let enhanceLevel = 0; enhanceLevel <= 20; enhanceLevel++) {
                    const instance = { level, rarity, enhanceLevel, refineLevel: 0 } as never;
                    const [a, b] = underBoth(() => ({
                        enhance: equipmentUpgradeService.enhanceCost(instance, group, enhance),
                        refine: equipmentUpgradeService.refineCost(instance, refine),
                    }));
                    checkEqual(a, b, `${group}/${rarity} L${level} +${enhanceLevel}`);
                }
            }
        }
    }
});
