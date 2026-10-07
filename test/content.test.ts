import assert from "node:assert/strict";
import { DateTime } from "luxon";
import type { Condition } from "@/modules/dialogues/schemas/condition.schema.js";
import {
    DialogueNodesSchema,
    type DialogueNode,
    type DialogueRule,
} from "@/modules/dialogues/schemas/dialogue.schema.js";
import {
    evaluateConditions,
    type ConditionContext,
} from "@/modules/dialogues/utils/condition.util.js";
import { validateDialogueGraph } from "@/modules/dialogues/utils/dialogue-graph.util.js";
import { selectDialogueCode } from "@/modules/dialogues/utils/dialogue-rule.util.js";
import { DIALOGUES } from "@/modules/dialogues/seeds/dialogue.seed-data.js";
import { loadMapFiles } from "@/modules/maps/seeds/game-map.seed.js";
import { parseMapFile, validateMapFileRefs } from "@/modules/maps/utils/map-file.util.js";
import { NPCS } from "@/modules/npcs/seeds/npc.seed-data.js";
import { QuestObjectiveType, QuestRepeat, QuestState } from "@/modules/quests/enums/quest.enum.js";
import type { Quest } from "@/modules/quests/entities/quest.entity.js";
import type { PlayerQuests } from "@/modules/quests/schemas/quest.schema.js";
import { QUESTS } from "@/modules/quests/seeds/quest.seed-data.js";
import { QuestDefinitionSchema } from "@/modules/quests/schemas/quest.schema.js";
import { findContentRefErrors } from "@/modules/quests/utils/content-refs.util.js";
import {
    applyQuestEvent,
    canAcceptQuest,
    newQuestEntry,
    questStateOf,
} from "@/modules/quests/utils/quest-progress.util.js";

const ctx = (overrides: Partial<ConditionContext> = {}): ConditionContext => ({
    level: 5,
    classCode: "knight",
    baseClassCode: "swordsman",
    mapCode: "town_01",
    flags: {},
    questState: () => QuestState.NOT_STARTED,
    itemCount: () => 0,
    currency: () => 0,
    ...overrides,
});

describe("condition", () => {
    it("level và class (class gốc cũng khớp)", () => {
        assert.ok(evaluateConditions(ctx(), [{ type: "level_min", value: 5 }]));
        assert.ok(!evaluateConditions(ctx(), [{ type: "level_min", value: 6 }]));
        assert.ok(evaluateConditions(ctx(), [{ type: "class_in", codes: ["swordsman"] }]));
        assert.ok(!evaluateConditions(ctx(), [{ type: "class_in", codes: ["archer"] }]));
    });

    it("negate đảo kết quả, danh sách rỗng luôn đúng", () => {
        const notHigh: Condition = { type: "level_min", value: 50, negate: true };
        assert.ok(evaluateConditions(ctx(), [notHigh]));
        assert.ok(evaluateConditions(ctx(), []));
        assert.ok(evaluateConditions(ctx(), undefined));
    });

    it("flag, item, quest_state, map, currency", () => {
        const c = ctx({
            flags: { met_elder: true, rank: 3 },
            itemCount: (code) => (code === "herb" ? 4 : 0),
            questState: (code) => (code === "q" ? QuestState.READY : QuestState.NOT_STARTED),
            currency: () => 100,
        });
        assert.ok(evaluateConditions(c, [{ type: "flag", key: "met_elder" }]));
        assert.ok(!evaluateConditions(c, [{ type: "flag", key: "missing" }]));
        assert.ok(evaluateConditions(c, [{ type: "flag", key: "rank", value: 3 }]));
        assert.ok(evaluateConditions(c, [{ type: "has_item", itemCode: "herb", quantity: 4 }]));
        assert.ok(!evaluateConditions(c, [{ type: "has_item", itemCode: "herb", quantity: 5 }]));
        assert.ok(
            evaluateConditions(c, [
                { type: "quest_state", questCode: "q", state: QuestState.READY },
            ])
        );
        assert.ok(evaluateConditions(c, [{ type: "map_is", mapCode: "town_01" }]));
        assert.ok(
            evaluateConditions(c, [
                { type: "currency_min", currency: "gold" as never, amount: 100 },
            ])
        );
    });
});

describe("dialogue graph", () => {
    const node = (id: string, extra: Partial<DialogueNode> = {}): DialogueNode => ({
        id,
        ...extra,
    });

    it("hợp lệ", () => {
        assert.deepEqual(validateDialogueGraph([node("start", { next: "end" }), node("end")]), []);
    });

    it("bắt thiếu start, next sai, trùng id, node mồ côi", () => {
        assert.ok(validateDialogueGraph([node("a")]).some((e) => e.includes("missing")));
        assert.ok(
            validateDialogueGraph([node("start", { next: "nope" })]).some((e) =>
                e.includes("unknown node")
            )
        );
        assert.ok(
            validateDialogueGraph([node("start"), node("start")]).some((e) =>
                e.includes("duplicate node")
            )
        );
        assert.ok(
            validateDialogueGraph([node("start"), node("orphan")]).some((e) =>
                e.includes("unreachable")
            )
        );
    });

    it("không cho vừa có next vừa có options", () => {
        const errors = validateDialogueGraph([
            node("start", { next: "b", options: [{ id: "o", hideIfFail: false }] }),
            node("b"),
        ]);
        assert.ok(errors.some((e) => e.includes("both")));
    });

    it("mọi thoại seed đều hợp lệ", () => {
        for (const dialogue of DIALOGUES) {
            const nodes = DialogueNodesSchema.parse(dialogue.nodes);
            assert.deepEqual(validateDialogueGraph(nodes), [], dialogue.code);
        }
    });
});

describe("dialogue rule", () => {
    const rules: DialogueRule[] = [
        { priority: 1, conditions: [], dialogueCode: "low" },
        { priority: 9, conditions: [{ type: "level_min", value: 10 }], dialogueCode: "high" },
        { priority: 5, mapCode: "field_01", conditions: [], dialogueCode: "field" },
    ];
    const npc = { defaultDialogueCode: "default", dialogueRules: rules };

    it("rule priority cao nhất thoả điều kiện thắng", () => {
        assert.equal(selectDialogueCode(npc, ctx({ level: 20 })), "high");
        assert.equal(selectDialogueCode(npc, ctx({ level: 5 })), "low");
    });

    it("rule theo map chỉ áp dụng ở map đó", () => {
        assert.equal(selectDialogueCode(npc, ctx({ mapCode: "field_01" })), "field");
    });

    it("không rule nào khớp → thoại mặc định", () => {
        const only = { defaultDialogueCode: "default", dialogueRules: [rules[1]] };
        assert.equal(selectDialogueCode(only, ctx()), "default");
        assert.equal(
            selectDialogueCode({ defaultDialogueCode: null, dialogueRules: [] }, ctx()),
            undefined
        );
    });
});

describe("quest progress", () => {
    const quest = {
        code: "q",
        enabled: true,
        requiredLevel: 3,
        prerequisiteQuestCodes: ["pre"],
        classCodes: [],
        repeat: QuestRepeat.NONE,
        conditions: [],
        objectives: [
            { id: "kill", type: QuestObjectiveType.KILL, targetCode: "slime", count: 2 },
            { id: "get", type: QuestObjectiveType.COLLECT, targetCode: "herb", count: 3 },
        ],
    } as unknown as Quest;
    const now = DateTime.fromISO("2026-01-10T12:00:00");
    const noItems = () => 0;

    it("trạng thái: chưa nhận → đang làm → sẵn sàng", () => {
        assert.equal(questStateOf(quest, undefined, noItems), QuestState.NOT_STARTED);
        const entry = newQuestEntry(now);
        assert.equal(questStateOf(quest, entry, noItems), QuestState.ACTIVE);
        entry.progress.kill = 2;
        assert.equal(questStateOf(quest, entry, noItems), QuestState.ACTIVE);
        assert.equal(
            questStateOf(quest, entry, () => 3),
            QuestState.READY
        );
        entry.status = "completed";
        assert.equal(questStateOf(quest, entry, noItems), QuestState.COMPLETED);
    });

    it("kill cộng tiến độ, kẹp theo count, bỏ qua mục tiêu khác", () => {
        const quests: PlayerQuests = { q: newQuestEntry(now) };
        const defs = (code: string) => (code === "q" ? quest : undefined);
        const kill = { type: QuestObjectiveType.KILL as const, targetCode: "slime" };
        assert.deepEqual(applyQuestEvent(quests, defs, kill), ["q"]);
        applyQuestEvent(quests, defs, kill);
        assert.deepEqual(applyQuestEvent(quests, defs, kill), []);
        assert.equal(quests.q.progress.kill, 2);
        assert.deepEqual(applyQuestEvent(quests, defs, { ...kill, targetCode: "bat" }), []);
    });

    it("quest đã xong không nhận thêm tiến độ", () => {
        const entry = newQuestEntry(now);
        entry.status = "completed";
        const changed = applyQuestEvent({ q: entry }, () => quest, {
            type: QuestObjectiveType.KILL,
            targetCode: "slime",
        });
        assert.deepEqual(changed, []);
    });

    it("điều kiện nhận: level, tiền quyết", () => {
        const prereqDone = ctx({ questState: () => QuestState.COMPLETED });
        assert.ok(canAcceptQuest(quest, undefined, prereqDone, now));
        assert.ok(!canAcceptQuest(quest, undefined, ctx({ ...prereqDone, level: 2 }), now));
        assert.ok(!canAcceptQuest(quest, undefined, ctx(), now));
    });

    it("làm lại: none không, daily sang ngày mới, infinite luôn", () => {
        const done = (at: string) => ({
            ...newQuestEntry(now),
            status: "completed" as const,
            completedAt: at,
        });
        const open = ctx({ questState: () => QuestState.COMPLETED });
        const q = (repeat: QuestRepeat) => ({ ...quest, repeat }) as Quest;
        const today = done("2026-01-10T08:00:00");
        const yesterday = done("2026-01-09T23:00:00");
        assert.ok(!canAcceptQuest(q(QuestRepeat.NONE), yesterday, open, now));
        assert.ok(!canAcceptQuest(q(QuestRepeat.DAILY), today, open, now));
        assert.ok(canAcceptQuest(q(QuestRepeat.DAILY), yesterday, open, now));
        assert.ok(canAcceptQuest(q(QuestRepeat.INFINITE), today, open, now));
        assert.ok(!canAcceptQuest(q(QuestRepeat.INFINITE), newQuestEntry(now), open, now));
    });
});

describe("content data", () => {
    it("quest seed hợp lệ theo schema", () => {
        for (const quest of QUESTS) QuestDefinitionSchema.parse(quest);
    });

    it("mọi tham chiếu chéo trong data seed đều tồn tại", () => {
        const errors = findContentRefErrors({
            maps: loadMapFiles(),
            npcs: NPCS.map((npc) => ({
                code: npc.code,
                defaultDialogueCode: npc.defaultDialogueCode ?? null,
                dialogueRules: npc.dialogueRules ?? [],
                functions: npc.functions ?? [],
            })),
            dialogues: DIALOGUES.map((d) => ({ code: d.code, nodes: d.nodes ?? [] })),
            quests: QUESTS.map((q) => ({
                code: q.code,
                giverNpcCode: q.giverNpcCode,
                turnInNpcCode: q.turnInNpcCode,
                prerequisiteQuestCodes: q.prerequisiteQuestCodes ?? [],
                objectives: q.objectives ?? [],
                rewards: q.rewards,
                conditions: q.conditions ?? [],
            })),
            itemCodes: new Set(["hp_potion_small"]),
            monsterCodes: new Set(
                loadMapFiles().flatMap((m) => m.monsterSpawns.map((s) => s.monsterCode))
            ),
        });
        assert.deepEqual(errors, []);
    });

    it("bắt tham chiếu sai", () => {
        const errors = findContentRefErrors({
            maps: [],
            npcs: [{ code: "n", defaultDialogueCode: "ghost", dialogueRules: [], functions: [] }],
            dialogues: [],
            quests: [],
            itemCodes: new Set(),
            monsterCodes: new Set(),
        });
        assert.equal(errors.length, 1);
    });

    it("portal phải trỏ tới map và spawn có thật", () => {
        const base = {
            type: "town",
            width: 10,
            height: 10,
            spawnPoints: [{ id: "default", x: 1, y: 1, kind: "default" }],
        };
        const a = parseMapFile({
            ...base,
            code: "a",
            interactables: [
                { id: "p", type: "portal", x: 1, y: 1, targetMapCode: "b", targetSpawnId: "nope" },
            ],
        });
        const b = parseMapFile({ ...base, code: "b" });
        assert.equal(validateMapFileRefs([a, b]).length, 1);
        assert.equal(validateMapFileRefs([a]).length, 1);
    });
});
