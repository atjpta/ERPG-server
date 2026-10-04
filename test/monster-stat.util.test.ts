import assert from "node:assert/strict";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import { computeMonsterStats } from "@/modules/monsters/utils/monster-stat.util.js";

describe("monster-stat.util — computeMonsterStats", () => {
    it("stat cuối = cố định + tăng theo level × level", () => {
        const stats = computeMonsterStats(
            {
                stats: { [StatKey.MOVE_SPEED]: 2, [StatKey.PHYSICAL_ATTACK]: 3 },
                statsPerLevel: { [StatKey.MAX_HP]: 50, [StatKey.PHYSICAL_ATTACK]: 5 },
            },
            3
        );
        assert.deepEqual(stats, {
            [StatKey.MOVE_SPEED]: 2,
            [StatKey.PHYSICAL_ATTACK]: 18,
            [StatKey.MAX_HP]: 150,
        });
    });
});
