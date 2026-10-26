import type { Npc } from "@/modules/npcs/entities/npc.entity.js";
import type { NpcFunction } from "@/modules/npcs/schemas/npc-function.schema.js";
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

    /** Chức năng của một chỗ đặt: `functions` của slot thay hẳn của NPC (vd đích của từng cổng), không có thì dùng của NPC. */
    functionsOf(slot: {
        npcCode: string;
        functions?: readonly NpcFunction[];
    }): readonly NpcFunction[] {
        return slot.functions ?? this.getByCode(slot.npcCode)?.functions ?? [];
    }

    /** Bán kính tương tác của một chỗ đặt: của slot nếu có, không thì của NPC (`npc_config`). */
    radiusOf(slot: { npcCode: string; radius?: number }): number {
        return slot.radius ?? this.getByCode(slot.npcCode)?.interactRadius ?? 0;
    }

    list(): readonly Npc[] {
        return [...this.byCode.values()];
    }
}

export const npcService = new NpcService();
