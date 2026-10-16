import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeCSharpSchemas } from "./normalize-csharp-schemas.mjs";

test("string enum payloads deserialize as strings while enum constants remain available", () => {
    const output = normalizeCSharpSchemas(
        new Map([
            [
                "QuestState.cs",
                'namespace ERPG.Schema { public struct QuestState { public const string ACTIVE = "active"; } }',
            ],
            [
                "QuestMessage.cs",
                "namespace ERPG.Schema {\n\tpublic class QuestMessage { public QuestState state; public QuestState[] states; public double count; }\n}",
            ],
            [
                "WorldChainResult.cs",
                "namespace ERPG.Schema { public enum WorldChainResult : int { CONTINUE = 0, STOP = 1 } }",
            ],
        ])
    );
    assert.match(output.get("QuestMessage.cs"), /public string state;/);
    assert.match(output.get("QuestMessage.cs"), /public string\[\] states;/);
    assert.match(output.get("QuestMessage.cs"), /public double count;/);
    assert.match(output.get("QuestMessage.cs"), /UnityEngine.Scripting.Preserve/);
    assert.match(output.get("QuestState.cs"), /Values = \{ ACTIVE \}/);
    assert.match(output.get("WorldChainResult.cs"), /public enum WorldChainResult : int/);
});

test("slot and wallet dictionaries derive their keys from generated fields", () => {
    const output = normalizeCSharpSchemas(
        new Map([
            [
                "EquipmentsMessage.cs",
                "namespace ERPG.Schema {\n\tpublic class EquipmentsMessage { public EquippedItemMessage main_hand; public EquippedItemMessage head; }\n}",
            ],
            [
                "WalletMessage.cs",
                "namespace ERPG.Schema {\n\tpublic class WalletMessage { public CurrencyBalanceMessage gold; }\n}",
            ],
        ])
    );
    assert.match(output.get("EquipmentsMessage.cs"), /Dictionary<string, EquippedItemMessage>/);
    assert.match(output.get("EquipmentsMessage.cs"), /\["main_hand"\] = main_hand/);
    assert.match(output.get("WalletMessage.cs"), /\["gold"\] = gold/);
});
