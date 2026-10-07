import { Quests } from "@/modules/quests/entities/quest.entity.js";
import { QuestRepo } from "@/modules/quests/repositories/quest.repository.js";
import { QuestDefinitionSchema } from "@/modules/quests/schemas/quest.schema.js";
import { QUESTS } from "@/modules/quests/seeds/quest.seed-data.js";

export const QuestSeed = async () => {
    for (const quest of QUESTS) {
        const definition = QuestDefinitionSchema.parse(quest);
        const data = { ...quest, ...definition };
        await QuestRepo.upsert({
            data,
            target: Quests.code,
            matchValue: quest.code,
            updateData: data,
        });
    }
    console.info("✅ [QuestSeed] Done");
};
