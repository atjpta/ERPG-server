import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    QuestCategory,
    QuestObjectiveType,
    QuestState,
} from "@/modules/quests/enums/quest.enum.js";
import {
    collectQuestTargets,
    npcMarkerFor,
    type MarkerQuest,
} from "@/rooms/world/content/utils/quest-marker.world.util.js";
import { NpcMarker } from "@/rooms/world/world.message.js";

const quest = (extra: Partial<MarkerQuest> = {}): MarkerQuest => ({
    category: QuestCategory.HERO,
    giverNpcCode: "chief",
    turnInNpcCode: "chief",
    objectives: [],
    state: QuestState.NOT_STARTED,
    acceptable: true,
    doneObjectiveIds: new Set(),
    ...extra,
});

describe("npcMarkerFor", () => {
    it("chưa nhận: ! theo màu loại quest", () => {
        assert.deepEqual(npcMarkerFor("chief", [quest()]), {
            marker: NpcMarker.AVAILABLE,
            category: QuestCategory.HERO,
        });
        assert.deepEqual(npcMarkerFor("chief", [quest({ category: QuestCategory.SIDE })]), {
            marker: NpcMarker.AVAILABLE,
            category: QuestCategory.SIDE,
        });
    });

    it("chưa đủ điều kiện nhận thì không có dấu", () => {
        assert.equal(npcMarkerFor("chief", [quest({ acceptable: false })]).marker, NpcMarker.NONE);
    });

    it("đã nhận: ? xám tại NPC trả quest, NPC khác không có dấu", () => {
        const active = quest({ state: QuestState.ACTIVE, turnInNpcCode: "guild" });
        assert.equal(npcMarkerFor("guild", [active]).marker, NpcMarker.IN_PROGRESS);
        assert.equal(npcMarkerFor("chief", [active]).marker, NpcMarker.NONE);
    });

    it("NPC là đích nói chuyện của quest đang làm: ! xám, nói rồi thì hết", () => {
        const objective = {
            id: "talk",
            type: QuestObjectiveType.TALK,
            targetCode: "smith",
            count: 1,
        };
        const active = quest({ state: QuestState.ACTIVE, objectives: [objective] });
        assert.equal(npcMarkerFor("smith", [active]).marker, NpcMarker.TALK_TARGET);
        const done = { ...active, doneObjectiveIds: new Set(["talk"]) };
        assert.equal(npcMarkerFor("smith", [done]).marker, NpcMarker.NONE);
    });

    it("hoàn thành: ? màu loại quest, thắng mọi dấu khác", () => {
        const ready = quest({ state: QuestState.READY, category: QuestCategory.DAILY });
        const hero = quest({ category: QuestCategory.HERO });
        assert.deepEqual(npcMarkerFor("chief", [hero, ready]), {
            marker: NpcMarker.READY,
            category: QuestCategory.DAILY,
        });
    });

    it("cùng loại dấu: hero thắng daily thắng side", () => {
        const result = npcMarkerFor("chief", [
            quest({ category: QuestCategory.SIDE }),
            quest({ category: QuestCategory.HERO }),
            quest({ category: QuestCategory.DAILY }),
        ]);
        assert.equal(result.category, QuestCategory.HERO);
    });
});

describe("collectQuestTargets", () => {
    const objective = (
        type: QuestObjectiveType,
        targetCode: string,
        current: number,
        count = 3
    ) => ({
        id: `${type}_${targetCode}`,
        type,
        targetCode,
        count,
        current,
    });

    it("gom quái / item / vật thể / NPC / hầm ngục còn dở của quest đang làm", () => {
        const targets = collectQuestTargets([
            {
                state: QuestState.ACTIVE,
                objectives: [
                    objective(QuestObjectiveType.KILL, "slime", 1),
                    objective(QuestObjectiveType.COLLECT, "dust_armor", 0),
                    objective(QuestObjectiveType.INTERACT, "herb", 0),
                    objective(QuestObjectiveType.TALK, "smith", 0, 1),
                    objective(QuestObjectiveType.CLEAR_DUNGEON, "slime_hollow", 0, 1),
                ],
            },
        ]);
        assert.deepEqual(targets, {
            monsterCodes: ["slime"],
            itemCodes: ["dust_armor"],
            interactableIds: ["herb"],
            npcCodes: ["smith"],
            dungeonMapCodes: ["slime_hollow"],
        });
    });

    it("mục tiêu xong thì bỏ Q, trừ item collect (phải giữ tới lúc trả quest)", () => {
        const targets = collectQuestTargets([
            {
                state: QuestState.READY,
                objectives: [
                    objective(QuestObjectiveType.KILL, "slime", 3),
                    objective(QuestObjectiveType.COLLECT, "dust_armor", 3),
                ],
            },
        ]);
        assert.deepEqual(targets.monsterCodes, []);
        assert.deepEqual(targets.itemCodes, ["dust_armor"]);
    });

    it("quest chưa nhận hoặc đã xong không đánh dấu", () => {
        const objectives = [objective(QuestObjectiveType.KILL, "slime", 0)];
        assert.deepEqual(
            collectQuestTargets([
                { state: QuestState.NOT_STARTED, objectives },
                { state: QuestState.COMPLETED, objectives },
            ]).monsterCodes,
            []
        );
    });
});
