import type { Quest } from "@/modules/quests/entities/quest.entity.js";
import { QuestRepo } from "@/modules/quests/repositories/quest.repository.js";

export class QuestService {
    private readonly byCode = new Map<string, Quest>();

    async setCacheData() {
        const rows = await QuestRepo.findEnabled();
        this.byCode.clear();
        for (const row of rows) this.byCode.set(row.code, row);
        console.log(`Cached ${rows.length} quests`);
    }

    getByCode(code: string): Quest | undefined {
        return this.byCode.get(code);
    }

    list(): readonly Quest[] {
        return [...this.byCode.values()];
    }
}

export const questService = new QuestService();
