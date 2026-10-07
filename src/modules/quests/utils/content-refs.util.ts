import type { Dialogue } from "@/modules/dialogues/entities/dialogue.entity.js";
import type { MapFile } from "@/modules/maps/schemas/map-file.schema.js";
import type { Npc } from "@/modules/npcs/entities/npc.entity.js";
import { QuestObjectiveType } from "@/modules/quests/enums/quest.enum.js";
import type { Quest } from "@/modules/quests/entities/quest.entity.js";
import type { Action, Condition } from "@/modules/dialogues/schemas/condition.schema.js";

export interface ContentData {
    maps: readonly MapFile[];
    npcs: readonly Pick<Npc, "code" | "defaultDialogueCode" | "dialogueRules" | "functions">[];
    dialogues: readonly Pick<Dialogue, "code" | "nodes">[];
    quests: readonly Pick<
        Quest,
        | "code"
        | "giverNpcCode"
        | "turnInNpcCode"
        | "prerequisiteQuestCodes"
        | "objectives"
        | "rewards"
        | "conditions"
    >[];
    itemCodes: ReadonlySet<string>;
    monsterCodes: ReadonlySet<string>;
}

/**
 * Mọi code mà map / NPC / thoại / quest tham chiếu phải có thật — chạy sau seed để data sai thì
 * dừng ngay thay vì lỗi lúc đang chơi. Trả danh sách lỗi (rỗng = hợp lệ).
 */
export const findContentRefErrors = (data: ContentData): string[] => {
    const errors: string[] = [];
    const npcs = new Map(data.npcs.map((npc) => [npc.code, npc]));
    const dialogues = new Set(data.dialogues.map((d) => d.code));
    const quests = new Set(data.quests.map((q) => q.code));
    const interactableIds = new Set(data.maps.flatMap((m) => m.interactables.map((i) => i.id)));
    const need = (set: ReadonlySet<string>, code: string, where: string, kind: string) => {
        if (!set.has(code)) errors.push(`${where}: unknown ${kind} "${code}"`);
    };
    const npcCodes = new Set(npcs.keys());

    const checkCondition = (condition: Condition, where: string) => {
        if (condition.type === "quest_state") need(quests, condition.questCode, where, "quest");
        if (condition.type === "has_item") need(data.itemCodes, condition.itemCode, where, "item");
    };
    const checkAction = (action: Action, where: string, npcCode?: string) => {
        switch (action.type) {
            case "start_quest":
            case "complete_quest":
                need(quests, action.questCode, where, "quest");
                break;
            case "give_item":
            case "take_item":
                need(data.itemCodes, action.itemCode, where, "item");
                break;
            case "open_function": {
                const fns = npcCode ? (npcs.get(npcCode)?.functions ?? []) : [];
                if (!fns.some((fn) => fn.id === action.function)) {
                    errors.push(
                        `${where}: npc "${npcCode ?? "-"}" has no function "${action.function}"`
                    );
                }
                break;
            }
            case "teleport":
                if (
                    !data.maps.some(
                        (m) =>
                            m.code === action.mapCode &&
                            m.spawnPoints.some((p) => p.id === action.spawnId)
                    )
                ) {
                    errors.push(`${where}: unknown spawn "${action.mapCode}.${action.spawnId}"`);
                }
                break;
            default:
                break;
        }
    };

    for (const map of data.maps) {
        for (const npc of map.npcs) need(npcCodes, npc.npcCode, `map ${map.code}`, "npc");
        for (const it of map.interactables) {
            const where = `map ${map.code}.${it.id}`;
            for (const c of it.conditions ?? []) checkCondition(c, where);
            if (it.type === "sign") need(dialogues, it.dialogueCode, where, "dialogue");
            if (it.type === "gather") {
                for (const item of it.reward.items)
                    need(data.itemCodes, item.itemCode, where, "item");
            }
        }
        for (const spawn of map.monsterSpawns) {
            need(data.monsterCodes, spawn.monsterCode, `map ${map.code}`, "monster");
        }
    }
    for (const npc of data.npcs) {
        const where = `npc ${npc.code}`;
        if (npc.defaultDialogueCode) need(dialogues, npc.defaultDialogueCode, where, "dialogue");
        for (const rule of npc.dialogueRules) {
            need(dialogues, rule.dialogueCode, where, "dialogue");
            for (const c of rule.conditions) checkCondition(c, where);
        }
    }
    for (const dialogue of data.dialogues) {
        for (const node of dialogue.nodes) {
            const where = `dialogue ${dialogue.code}.${node.id}`;
            // Dialogue dùng chung nhiều NPC nên không biết NPC nào — open_function kiểm ở NPC đang nói chuyện lúc chạy.
            for (const a of node.actions ?? []) {
                if (a.type !== "open_function") checkAction(a, where);
            }
            for (const option of node.options ?? []) {
                for (const c of option.conditions ?? []) checkCondition(c, where);
                for (const a of option.actions ?? []) {
                    if (a.type !== "open_function") checkAction(a, where);
                }
            }
        }
    }
    for (const quest of data.quests) {
        const where = `quest ${quest.code}`;
        need(npcCodes, quest.giverNpcCode, where, "npc");
        need(npcCodes, quest.turnInNpcCode, where, "npc");
        for (const code of quest.prerequisiteQuestCodes) need(quests, code, where, "quest");
        for (const c of quest.conditions) checkCondition(c, where);
        for (const item of quest.rewards.items) need(data.itemCodes, item.itemCode, where, "item");
        for (const objective of quest.objectives) {
            switch (objective.type) {
                case QuestObjectiveType.KILL:
                    need(data.monsterCodes, objective.targetCode, where, "monster");
                    break;
                case QuestObjectiveType.COLLECT:
                    need(data.itemCodes, objective.targetCode, where, "item");
                    break;
                case QuestObjectiveType.TALK:
                    need(npcCodes, objective.targetCode, where, "npc");
                    break;
                case QuestObjectiveType.INTERACT:
                    need(interactableIds, objective.targetCode, where, "interactable");
                    break;
            }
        }
    }
    return errors;
};
