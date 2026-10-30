import { z } from "zod";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { unityMasterDataService } from "@/modules/master-data/services/unity-master-data.service.js";
import { resolveNpcRule } from "@/modules/npcs/schemas/npc-config.schema.js";
import { DialogueRuleSchema } from "@/modules/dialogues/schemas/dialogue.schema.js";
import { Npcs } from "@/modules/npcs/entities/npc.entity.js";
import { NpcRepo } from "@/modules/npcs/repositories/npc.repository.js";
import { NpcFunctionSchema } from "@/modules/npcs/schemas/npc-function.schema.js";
import { NPCS } from "@/modules/npcs/seeds/npc.seed-data.js";

export const NpcSeed = async () => {
    const npcConfig = unityMasterDataService.loadUnityMasterData(MasterDataKey.NPC_CONFIG);
    for (const npc of NPCS) {
        // Talk range is authored in Unity (Ranges tab): a base for every NPC, an NPC's own number over it.
        const { interactRadius } = resolveNpcRule(npcConfig, npc.code);
        const data = {
            ...npc,
            interactRadius,
            dialogueRules: z.array(DialogueRuleSchema).parse(npc.dialogueRules ?? []),
            functions: z.array(NpcFunctionSchema).parse(npc.functions ?? []),
        };
        await NpcRepo.upsert({ data, target: Npcs.code, matchValue: npc.code, updateData: data });
    }
    console.info("✅ [NpcSeed] Done");
};
