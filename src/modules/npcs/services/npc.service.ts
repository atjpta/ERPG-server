import type { Npc } from "@/modules/npcs/entities/npc.entity.js";
import { NpcRepo } from "@/modules/npcs/repositories/npc.repository.js";

export class NpcService {
    private readonly byCode = new Map<string, Npc>();

    async setCacheData() {
        const rows = await NpcRepo.findEnabled();
        this.byCode.clear();
        for (const row of rows) this.byCode.set(row.code, row);
        console.log(`Cached ${rows.length} npcs`);
    }

    getByCode(code: string): Npc | undefined {
        return this.byCode.get(code);
    }

    list(): readonly Npc[] {
        return [...this.byCode.values()];
    }
}

export const npcService = new NpcService();
