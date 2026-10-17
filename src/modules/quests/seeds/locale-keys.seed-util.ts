import type { Dialogue } from "@/modules/dialogues/entities/dialogue.entity.js";
import { nodeTextKey, optionTextKey } from "@/modules/dialogues/services/dialogue-graph.service.js";
import type { MapDefinition } from "@/modules/maps/schemas/map-definition.schema.js";
import type { Npc } from "@/modules/npcs/entities/npc.entity.js";
import { DAILY_QUEST_CODES } from "@/modules/quests/schemas/daily-quest.schema.js";
import type { Quest } from "@/modules/quests/entities/quest.entity.js";

/**
 * Mọi key locale mà client cần có bản dịch cho map / NPC / quest / thoại — server chỉ gửi code, client
 * tra bảng text theo các key này. Xuất ra `locale-keys.json` để người dịch đối chiếu thiếu sót.
 */
export const collectLocaleKeys = (data: {
    maps: readonly Pick<MapDefinition, "code" | "interactables">[];
    npcs: readonly Pick<Npc, "code">[];
    dialogues: readonly Pick<Dialogue, "code" | "nodes">[];
    quests: readonly Pick<Quest, "code" | "objectives">[];
}): string[] => {
    const keys = new Set<string>();
    for (const map of data.maps) {
        keys.add(`map.${map.code}.name`);
        for (const it of map.interactables) keys.add(`interactable.${it.id}.name`);
    }
    for (const npc of data.npcs) {
        keys.add(`npc.${npc.code}.name`);
        keys.add(`npc.${npc.code}.role`);
    }
    for (const quest of data.quests) {
        keys.add(`quest.${quest.code}.name`);
        keys.add(`quest.${quest.code}.desc`);
        for (const objective of quest.objectives) {
            keys.add(`quest.${quest.code}.obj.${objective.id}`);
        }
    }
    // Quest hằng ngày sinh động nhưng text tra theo code cố định + id mục tiêu cố định.
    for (const code of DAILY_QUEST_CODES) {
        const objectiveId = code.replace("daily_", "");
        keys.add(`quest.${code}.name`);
        keys.add(`quest.${code}.desc`);
        keys.add(`quest.${code}.obj.${objectiveId}`);
    }
    for (const dialogue of data.dialogues) {
        for (const node of dialogue.nodes) {
            keys.add(nodeTextKey(dialogue.code, node));
            if (node.speakerKey) keys.add(node.speakerKey);
            for (const option of node.options ?? []) {
                keys.add(optionTextKey(dialogue.code, node.id, option));
            }
        }
    }
    return [...keys].sort();
};
