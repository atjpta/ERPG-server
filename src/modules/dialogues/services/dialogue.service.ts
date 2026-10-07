import type { Dialogue } from "@/modules/dialogues/entities/dialogue.entity.js";
import { DialogueRepo } from "@/modules/dialogues/repositories/dialogue.repository.js";
import type { DialogueNode } from "@/modules/dialogues/schemas/dialogue.schema.js";

/** Cache đồ thị thoại lúc khởi động (giống ItemService); admin sửa xong gọi lại `setCacheData`. */
export class DialogueService {
    private readonly byCode = new Map<string, Dialogue>();

    async setCacheData() {
        const rows = await DialogueRepo.findEnabled();
        this.byCode.clear();
        for (const row of rows) this.byCode.set(row.code, row);
        console.log(`Cached ${rows.length} dialogues`);
    }

    getByCode(code: string): Dialogue | undefined {
        return this.byCode.get(code);
    }

    getNode(code: string, nodeId: string): DialogueNode | undefined {
        return this.byCode.get(code)?.nodes.find((node) => node.id === nodeId);
    }
}

export const dialogueService = new DialogueService();
