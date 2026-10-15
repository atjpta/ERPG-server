import { readFileSync } from "node:fs";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import {
    MasterDataValueSchemas,
    type MasterDataValueMap,
} from "@/modules/master-data/schemas/master-data-value.schema.js";

/**
 * Master data that is about where things stand on the map (how far a player picks a target, how far a monster chases): it is
 * authored in Unity (Ranges tab of the Authoring Hub), written to `data/<key>.json`, and the seed copies it into the table. The
 * admin API does not change these keys; edit them in Unity and sync.
 */
export const UNITY_MASTER_DATA_KEYS = [
    MasterDataKey.PLAYER_TARGET_CONFIG,
    MasterDataKey.MONSTER_AI_CONFIG,
] as const;

export type UnityMasterDataKey = (typeof UNITY_MASTER_DATA_KEYS)[number];

export const isUnityMasterDataKey = (key: MasterDataKey): key is UnityMasterDataKey =>
    (UNITY_MASTER_DATA_KEYS as readonly MasterDataKey[]).includes(key);

/** The validated value Unity wrote for the key; a missing or malformed file is an error (run Tools/ERPG/Sync Server). */
export const loadUnityMasterData = <K extends UnityMasterDataKey>(
    key: K
): MasterDataValueMap[K] => {
    const file = new URL(`../data/${key}.json`, import.meta.url);
    let text: string;
    try {
        text = readFileSync(file, "utf-8");
    } catch (error) {
        throw new Error(`[MasterData] ${key}.json is missing: author it in Unity and sync`, {
            cause: error,
        });
    }
    return MasterDataValueSchemas[key].parse(JSON.parse(text)) as MasterDataValueMap[K];
};
