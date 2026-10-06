import assert from "node:assert/strict";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import {
    combineRewardScale,
    computeMonsterStats,
    monsterScales,
} from "@/modules/monsters/utils/monster-stat.util.js";
import { DEFAULT_MONSTER_SCALE_CONFIG } from "@/modules/monsters/seeds/monster.seed-data.js";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";

describe("monster-stat.util — computeMonsterStats", () => {
    const levelConfig = {
        statsPerLevel: { [StatKey.MAX_HP]: 1, [StatKey.PHYSICAL_ATTACK]: 0.5 },
    };

    it("stat cuối = base × (1 + tỉ lệ × (level − 1)), stat không có tỉ lệ giữ nguyên", () => {
        const stats = computeMonsterStats(
            {
                stats: {
                    [StatKey.MOVE_SPEED]: 2,
                    [StatKey.MAX_HP]: 50,
                    [StatKey.PHYSICAL_ATTACK]: 10,
                },
            },
            3,
            levelConfig
        );
        assert.deepEqual(stats, {
            [StatKey.MOVE_SPEED]: 2,
            [StatKey.PHYSICAL_ATTACK]: 20,
            [StatKey.MAX_HP]: 150,
        });
    });

    it("level 1 = chỉ số gốc", () => {
        const stats = computeMonsterStats({ stats: { [StatKey.MAX_HP]: 50 } }, 1, levelConfig);
        assert.deepEqual(stats, { [StatKey.MAX_HP]: 50 });
    });

    it("nhân hệ số loại × độ hiếm, stat không cấu hình giữ nguyên", () => {
        const stats = computeMonsterStats(
            {
                stats: {
                    [StatKey.MOVE_SPEED]: 2,
                    [StatKey.MAX_HP]: 50,
                    [StatKey.PHYSICAL_ATTACK]: 5,
                },
            },
            2,
            { statsPerLevel: { [StatKey.MAX_HP]: 1, [StatKey.PHYSICAL_ATTACK]: 1 } },
            [
                { stats: { [StatKey.MAX_HP]: 3, [StatKey.PHYSICAL_ATTACK]: 1.5 } },
                { stats: { [StatKey.MAX_HP]: 1.2 } },
            ]
        );
        assert.deepEqual(stats, {
            [StatKey.MOVE_SPEED]: 2,
            [StatKey.PHYSICAL_ATTACK]: 15,
            [StatKey.MAX_HP]: 360,
        });
    });

    it("hệ số thưởng boss legendary = boss × legendary", () => {
        const scale = combineRewardScale(
            monsterScales(
                { type: MonsterType.BOSS, rarity: ItemRarity.LEGENDARY },
                DEFAULT_MONSTER_SCALE_CONFIG
            )
        );
        assert.equal(scale.exp.toNumber(), 30);
        assert.equal(scale.dropRate.toNumber(), 37.5);
    });
});
