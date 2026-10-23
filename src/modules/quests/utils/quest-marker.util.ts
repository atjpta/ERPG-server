import {
    QuestCategory,
    QuestObjectiveType,
    QuestState,
} from "@/modules/quests/enums/quest.enum.js";
import type { QuestObjective } from "@/modules/quests/schemas/quest.schema.js";
import { NpcMarker } from "@/modules/npcs/enums/npc-marker.enum.js";

/** Hero > daily > side khi một NPC có nhiều quest cùng mức ưu tiên. */
const CATEGORY_RANK: Record<QuestCategory, number> = {
    [QuestCategory.HERO]: 0,
    [QuestCategory.DAILY]: 1,
    [QuestCategory.SIDE]: 2,
};

/** Mức ưu tiên của dấu: cái cần làm ngay hiện trước. */
const MARKER_RANK: Record<NpcMarker, number> = {
    [NpcMarker.READY]: 0,
    [NpcMarker.TALK_TARGET]: 1,
    [NpcMarker.IN_PROGRESS]: 2,
    [NpcMarker.AVAILABLE]: 3,
    [NpcMarker.NONE]: 4,
};

export interface MarkerQuest {
    category: QuestCategory;
    giverNpcCode: string;
    turnInNpcCode: string;
    objectives: readonly QuestObjective[];
    state: QuestState;
    /** Nhận được ngay bây giờ (đủ level, tiền quyết...). */
    acceptable: boolean;
    /** Mục tiêu nói chuyện đã xong (id) — đích đã nói rồi thì không còn `!` xám. */
    doneObjectiveIds: ReadonlySet<string>;
}

export interface MarkerResult {
    marker: NpcMarker;
    /** Loại quest quyết định màu; `undefined` khi không có dấu. */
    category?: QuestCategory;
}

/** Dấu hiện trên NPC `npcCode`, tính từ mọi quest player có thể thấy. */
export const npcMarkerFor = (npcCode: string, quests: readonly MarkerQuest[]): MarkerResult => {
    let best: MarkerResult = { marker: NpcMarker.NONE };
    const consider = (marker: NpcMarker, category: QuestCategory) => {
        const better =
            MARKER_RANK[marker] < MARKER_RANK[best.marker] ||
            (marker === best.marker &&
                best.category !== undefined &&
                CATEGORY_RANK[category] < CATEGORY_RANK[best.category]);
        if (better) best = { marker, category };
    };
    for (const quest of quests) {
        if (quest.turnInNpcCode === npcCode) {
            if (quest.state === QuestState.READY) consider(NpcMarker.READY, quest.category);
            if (quest.state === QuestState.ACTIVE) consider(NpcMarker.IN_PROGRESS, quest.category);
        }
        if (quest.state === QuestState.ACTIVE) {
            const isTalkTarget = quest.objectives.some(
                (objective) =>
                    objective.type === QuestObjectiveType.TALK &&
                    objective.targetCode === npcCode &&
                    !quest.doneObjectiveIds.has(objective.id)
            );
            if (isTalkTarget) consider(NpcMarker.TALK_TARGET, quest.category);
        }
        if (
            quest.giverNpcCode === npcCode &&
            quest.state === QuestState.NOT_STARTED &&
            quest.acceptable
        ) {
            consider(NpcMarker.AVAILABLE, quest.category);
        }
    }
    return best;
};

export interface QuestTargets {
    monsterCodes: string[];
    itemCodes: string[];
    interactableIds: string[];
    npcCodes: string[];
    dungeonMapCodes: string[];
}

/**
 * Mục tiêu còn dở của các quest đang làm — client đánh chữ Q: quái (bên trái tên), item (góc trên
 * phải), vật thể, NPC, hầm ngục. Mục tiêu `collect` giữ tới khi trả quest (item phải còn trong túi).
 */
export const collectQuestTargets = (
    quests: readonly {
        state: QuestState;
        objectives: readonly (QuestObjective & { current: number })[];
    }[]
): QuestTargets => {
    const sets = {
        monsterCodes: new Set<string>(),
        itemCodes: new Set<string>(),
        interactableIds: new Set<string>(),
        npcCodes: new Set<string>(),
        dungeonMapCodes: new Set<string>(),
    };
    for (const quest of quests) {
        if (quest.state !== QuestState.ACTIVE && quest.state !== QuestState.READY) continue;
        for (const objective of quest.objectives) {
            const done = objective.current >= objective.count;
            switch (objective.type) {
                case QuestObjectiveType.KILL:
                    if (!done) sets.monsterCodes.add(objective.targetCode);
                    break;
                case QuestObjectiveType.COLLECT:
                    sets.itemCodes.add(objective.targetCode);
                    break;
                case QuestObjectiveType.INTERACT:
                    if (!done) sets.interactableIds.add(objective.targetCode);
                    break;
                case QuestObjectiveType.TALK:
                    if (!done) sets.npcCodes.add(objective.targetCode);
                    break;
                case QuestObjectiveType.CLEAR_DUNGEON:
                    if (!done) sets.dungeonMapCodes.add(objective.targetCode);
                    break;
            }
        }
    }
    return {
        monsterCodes: [...sets.monsterCodes].sort(),
        itemCodes: [...sets.itemCodes].sort(),
        interactableIds: [...sets.interactableIds].sort(),
        npcCodes: [...sets.npcCodes].sort(),
        dungeonMapCodes: [...sets.dungeonMapCodes].sort(),
    };
};
