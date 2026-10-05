import assert from "node:assert/strict";
import { generateEntityId } from "@/core/entities/base.entity.js";
import { big } from "@/core/utils/big-number.util.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import type { MonsterDrops } from "@/modules/monsters/schemas/monster-drop.schema.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import {
    randomInt,
    rollDropRarity,
    rollMonsterReward,
} from "@/modules/rewards/utils/reward-roll.util.js";

const stoneId = generateEntityId();
const drops: MonsterDrops = {
    currency: [{ code: CurrencyCode.GOLD, min: 1, max: 10 }],
    items: [{ itemId: stoneId, min: 1, max: 3, rate: 0.5 }],
    equipment: { rate: 0.5, rarity: { [ItemRarity.COMMON]: 3, [ItemRarity.EPIC]: 1 } },
    exp: 20,
};

describe("reward-roll.util", () => {
    it("randomInt nằm trong [min, max] gồm cả 2 đầu", () => {
        assert.equal(
            randomInt(1, 10, () => 0),
            1
        );
        assert.equal(
            randomInt(1, 10, () => 0.9999),
            10
        );
    });

    it("rarity theo trọng số, không cấu hình → common", () => {
        assert.equal(
            rollDropRarity(drops.equipment!, () => 0.1),
            ItemRarity.COMMON
        );
        assert.equal(
            rollDropRarity(drops.equipment!, () => 0.9),
            ItemRarity.EPIC
        );
        assert.equal(
            rollDropRarity({ rate: 1, rarity: {} }, () => 0.9),
            ItemRarity.COMMON
        );
    });

    it("trúng tỉ lệ thì rơi item + trang bị, trượt thì không", () => {
        const equipment = { itemId: generateEntityId(), quantity: 1 };
        const hit = rollMonsterReward(drops, { rng: () => 0.1, rollEquipment: () => equipment });
        assert.deepEqual(hit.items, [{ itemId: stoneId, quantity: 1 }, equipment]);
        assert.equal(hit.exp, 20);

        const miss = rollMonsterReward(drops, { rng: () => 0.9, rollEquipment: () => equipment });
        assert.deepEqual(miss.items, []);
        assert.equal(miss.currency[0].amount, 10);
    });

    it("nhân exp, vàng, tỉ lệ rơi theo hệ số (tỉ lệ tối đa 1)", () => {
        const reward = rollMonsterReward(drops, {
            rng: () => 0.9,
            scale: { exp: big(3), gold: big(2.5), dropRate: big(2) },
        });
        assert.equal(reward.exp, 60);
        assert.equal(reward.currency[0].amount, 25);
        assert.equal(reward.items.length, 1);
    });
});
