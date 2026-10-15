import { strict as assert } from "node:assert";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import {
    UNITY_MASTER_DATA_KEYS,
    isUnityMasterDataKey,
    loadUnityMasterData,
} from "@/modules/master-data/utils/unity-master-data.util.js";
import { resolveNpcRule } from "@/modules/npcs/schemas/npc-config.schema.js";
import {
    MonsterAiConfigSchema,
    resolveMonsterAi,
} from "@/modules/monsters/schemas/monster-ai-config.schema.js";

describe("master data authored in Unity (the Ranges tab)", () => {
    it("loads a valid file for every Unity-owned key", () => {
        for (const key of UNITY_MASTER_DATA_KEYS) {
            assert.ok(loadUnityMasterData(key), key);
        }
    });

    it("owns the target ranges and the monster ranges, not the economy", () => {
        assert.ok(isUnityMasterDataKey(MasterDataKey.PLAYER_TARGET_CONFIG));
        assert.ok(isUnityMasterDataKey(MasterDataKey.MONSTER_AI_CONFIG));
        assert.equal(isUnityMasterDataKey(MasterDataKey.LEVEL_CONFIG), false);
        assert.equal(isUnityMasterDataKey(MasterDataKey.EQUIPMENT_DROP_CONFIG), false);
    });

    it("rejects a monster that would detect farther than it chases", () => {
        const ai = loadUnityMasterData(MasterDataKey.MONSTER_AI_CONFIG);
        const base = ai.default;
        assert.equal(MonsterAiConfigSchema.safeParse(ai).success, true);
        const withDefault = (change: object) => ({ ...ai, default: { ...base, ...change } });
        assert.equal(
            MonsterAiConfigSchema.safeParse(withDefault({ detectionRadius: base.leashRadius + 1 }))
                .success,
            false
        );
        assert.equal(
            MonsterAiConfigSchema.safeParse(withDefault({ idleMinMs: base.idleMaxMs + 1 })).success,
            false
        );
    });

    it("checks a monster override together with the default", () => {
        const ai = loadUnityMasterData(MasterDataKey.MONSTER_AI_CONFIG);
        const broken = { ...ai, monsters: { ...ai.monsters, slime: { detectionRadius: 99 } } };
        assert.equal(MonsterAiConfigSchema.safeParse(broken).success, false);
    });

    it("gives a monster its own number over the default, the rest from the default", () => {
        const ai = loadUnityMasterData(MasterDataKey.MONSTER_AI_CONFIG);
        const slime = resolveMonsterAi(ai, "slime");
        assert.equal(slime.moveSpeed, ai.monsters.slime?.moveSpeed ?? ai.default.moveSpeed);
        assert.equal(
            resolveMonsterAi(ai, "training_slime").moveSpeed,
            0,
            "the training slime stands still"
        );
        assert.equal(resolveMonsterAi(ai, "training_slime").leashRadius, ai.default.leashRadius);
    });

    it("gives an NPC the default talk range unless it has its own", () => {
        const npc = loadUnityMasterData(MasterDataKey.NPC_CONFIG);
        assert.equal(
            resolveNpcRule(npc, "village_chief").interactRadius,
            npc.npcs.village_chief?.interactRadius ?? npc.default.interactRadius
        );
        assert.equal(
            resolveNpcRule(
                { default: { interactRadius: 2 }, npcs: { a: { interactRadius: 5 } } },
                "a"
            ).interactRadius,
            5
        );
        assert.equal(
            resolveNpcRule(
                { default: { interactRadius: 2 }, npcs: { a: { interactRadius: 5 } } },
                "b"
            ).interactRadius,
            2
        );
    });

    it("keeps the target rule of every class complete", () => {
        const target = loadUnityMasterData(MasterDataKey.PLAYER_TARGET_CONFIG);
        assert.ok(target.keepTargetRange > 0);
        assert.ok(Object.keys(target.classes).length > 0);
    });
});
