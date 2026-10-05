import assert from "node:assert/strict";
import { StatKey, StatType } from "@/modules/player/enums/stat.enum.js";
import { createAttributes } from "@/modules/player/schemas/stat.schema.js";
import { computeStats } from "@/modules/player/utils/player-stat.util.js";

describe("player-stat.util — computeStats", () => {
    it("cộng tỉ lệ không bị sai số float (0.1 + 0.2 = 0.3)", () => {
        const { stats } = computeStats({
            classAttributes: createAttributes(),
            allocatedAttributes: createAttributes(),
            classBaseStats: {},
            bonuses: [
                { stat: StatKey.CRITICAL_CHANCE, type: StatType.FLAT, value: 0.1 },
                { stat: StatKey.CRITICAL_CHANCE, type: StatType.FLAT, value: 0.2 },
            ],
        });
        assert.equal(stats[StatKey.CRITICAL_CHANCE], 0.3);
    });

    it("FLAT cộng trước, PERCENT nhân sau; attribute quy đổi chính xác", () => {
        const { stats } = computeStats({
            classAttributes: { ...createAttributes(), [StatKey.LUCK]: 7 },
            allocatedAttributes: { ...createAttributes(), [StatKey.STRENGTH]: 10 },
            classBaseStats: {},
            bonuses: [
                { stat: StatKey.PHYSICAL_ATTACK, type: StatType.FLAT, value: 5 },
                { stat: StatKey.PHYSICAL_ATTACK, type: StatType.PERCENT, value: 0.1 },
            ],
        });
        assert.equal(stats[StatKey.PHYSICAL_ATTACK], 16.5);
        assert.equal(stats[StatKey.CRITICAL_CHANCE], 0.007);
        assert.equal(stats[StatKey.CRITICAL_DAMAGE], 1.57);
    });

    it("làm tròn tối đa 4 chữ số thập phân (half-up)", () => {
        const { stats } = computeStats({
            classAttributes: createAttributes(),
            allocatedAttributes: createAttributes(),
            classBaseStats: {},
            bonuses: [{ stat: StatKey.LIFE_STEAL, type: StatType.FLAT, value: 0.123456 }],
        });
        assert.equal(stats[StatKey.LIFE_STEAL], 0.1235);
    });

    it("cộng baseStats của class và quy đổi regen từ VIT/INT", () => {
        const { stats } = computeStats({
            classAttributes: {
                ...createAttributes(),
                [StatKey.VITALITY]: 5,
                [StatKey.INTELLIGENCE]: 3,
            },
            allocatedAttributes: createAttributes(),
            classBaseStats: { [StatKey.MOVE_SPEED]: 4, [StatKey.HP_REGEN]: 1 },
            bonuses: [],
        });
        assert.equal(stats[StatKey.MOVE_SPEED], 4);
        assert.equal(stats[StatKey.HP_REGEN], 2);
        assert.equal(stats[StatKey.MP_REGEN], 0.6);
    });
});
