import { Dialogues } from "@/modules/dialogues/entities/dialogue.entity.js";
import { DialogueRepo } from "@/modules/dialogues/repositories/dialogue.repository.js";
import { DialogueNodesSchema } from "@/modules/dialogues/schemas/dialogue.schema.js";
import { DIALOGUES } from "@/modules/dialogues/seeds/dialogue.seed-data.js";
import { validateDialogueGraph } from "@/modules/dialogues/utils/dialogue-graph.util.js";

export const DialogueSeed = async () => {
    for (const dialogue of DIALOGUES) {
        // Seed sai cấu trúc / đồ thị thì dừng ngay.
        const nodes = DialogueNodesSchema.parse(dialogue.nodes);
        const errors = validateDialogueGraph(nodes);
        if (errors.length > 0)
            throw new Error(`[DialogueSeed] ${dialogue.code}: ${errors.join("; ")}`);
        const data = { ...dialogue, nodes };
        await DialogueRepo.upsert({
            data,
            target: Dialogues.code,
            matchValue: dialogue.code,
            updateData: data,
        });
    }
    console.info("✅ [DialogueSeed] Done");
};
