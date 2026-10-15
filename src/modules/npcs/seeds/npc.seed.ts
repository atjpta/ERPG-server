import { z } from "zod";
import { npcCollider } from "@/modules/bodies/utils/entity-body.util.js";
import { DialogueRuleSchema } from "@/modules/dialogues/schemas/dialogue.schema.js";
import { Npcs } from "@/modules/npcs/entities/npc.entity.js";
import { NpcRepo } from "@/modules/npcs/repositories/npc.repository.js";
import { NpcFunctionSchema } from "@/modules/npcs/schemas/npc-function.schema.js";
import { NPCS } from "@/modules/npcs/seeds/npc.seed-data.js";

export const NpcSeed = async () => {
    for (const npc of NPCS) {
        // The foot collider comes from the NPC's Unity prefab (entity-bodies.json), not from the seed.
        const { width, height } = npcCollider(npc.code);
        const data = {
            ...npc,
            colliderWidth: width,
            colliderHeight: height,
            dialogueRules: z.array(DialogueRuleSchema).parse(npc.dialogueRules ?? []),
            functions: z.array(NpcFunctionSchema).parse(npc.functions ?? []),
        };
        await NpcRepo.upsert({ data, target: Npcs.code, matchValue: npc.code, updateData: data });
    }
    console.info("✅ [NpcSeed] Done");
};
