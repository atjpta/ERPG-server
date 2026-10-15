import { strict as assert } from "node:assert";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import {
    UNITY_MASTER_DATA_KEYS,
    isUnityMasterDataKey,
    loadUnityMasterData,
} from "@/modules/master-data/utils/unity-master-data.util.js";
import { MonsterAiConfigSchema } from "@/modules/monsters/schemas/monster-ai-config.schema.js";

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
        assert.equal(MonsterAiConfigSchema.safeParse(ai).success, true);
        assert.equal(
            MonsterAiConfigSchema.safeParse({ ...ai, detectionRadius: ai.leashRadius + 1 }).success,
            false
        );
        assert.equal(
            MonsterAiConfigSchema.safeParse({ ...ai, idleMinMs: ai.idleMaxMs + 1 }).success,
            false
        );
    });

    it("keeps the target rule of every class complete", () => {
        const target = loadUnityMasterData(MasterDataKey.PLAYER_TARGET_CONFIG);
        assert.ok(target.keepTargetRange > 0);
        assert.ok(Object.keys(target.classes).length > 0);
    });
});
