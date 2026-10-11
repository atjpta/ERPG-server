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
import { loadMapDefinitions } from "@/modules/maps/seeds/game-map.seed.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { DEFAULT_DUNGEON_DROP_CONFIG } from "@/modules/maps/seeds/dungeon-drop-config.seed-data.js";
import { MONSTER_DEFINITIONS } from "@/modules/monsters/seeds/monster.seed-data.js";
import { QuestCategory } from "@/modules/quests/enums/quest.enum.js";
import { unlockedFeatures, unlockFlagKey } from "@/modules/quests/utils/unlock.util.js";
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
    mapCode: "greenfield_village",
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
        assert.ok(evaluateConditions(c, [{ type: "map_is", mapCode: "greenfield_village" }]));
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

describe("hero / side quests", () => {
    const hero = QUESTS.filter((quest) => quest.category === QuestCategory.HERO);

    it("hero là một chuỗi tuyến tính: mỗi quest sau đòi quest ngay trước", () => {
        assert.equal(hero.length, 8);
        hero.forEach((quest, index) => {
            const expected = index === 0 ? [] : [hero[index - 1].code];
            assert.deepEqual(quest.prerequisiteQuestCodes, expected, quest.code);
            assert.ok((quest.requiredLevel ?? 1) >= (hero[index - 1]?.requiredLevel ?? 1));
        });
    });

    it("sortOrder tăng dần và chỉ hero mở khoá chức năng", () => {
        const orders = QUESTS.map((quest) => quest.sortOrder ?? 0);
        assert.deepEqual(
            orders,
            [...orders].sort((a, b) => a - b)
        );
        for (const quest of QUESTS) {
            if (quest.category !== QuestCategory.HERO) {
                assert.deepEqual(quest.unlockFeatures ?? [], [], quest.code);
            }
        }
    });

    it("mỗi quest có đủ thoại nhận / làm / trả và NPC có rule cho chúng", () => {
        const dialogues = new Set(DIALOGUES.map((dialogue) => dialogue.code));
        for (const quest of QUESTS) {
            for (const kind of ["offer", "progress", "done"]) {
                assert.ok(dialogues.has(`${quest.code}_${kind}`), `${quest.code}_${kind}`);
            }
            const giver = NPCS.find((npc) => npc.code === quest.giverNpcCode);
            const turnIn = NPCS.find((npc) => npc.code === quest.turnInNpcCode);
            const rules = (npc?: (typeof NPCS)[number]) =>
                (npc?.dialogueRules ?? []).map((rule) => rule.dialogueCode);
            assert.ok(rules(giver).includes(`${quest.code}_offer`), quest.code);
            assert.ok(rules(turnIn).includes(`${quest.code}_done`), quest.code);
        }
    });

    it("unlock flag: ghi theo tiền tố, đọc lại đúng danh sách", () => {
        const flags = {
            [unlockFlagKey("guild")]: true,
            [unlockFlagKey("dungeon")]: true,
            [unlockFlagKey("off")]: false,
            other: true,
        };
        assert.deepEqual(unlockedFeatures(flags), ["dungeon", "guild"]);
    });
});

describe("map definitions", () => {
    const definitions = loadMapDefinitions();

    it("không trùng code, mỗi dungeon có level cap, level vào map tăng dần theo cốt truyện", () => {
        const codes = definitions.map((map) => map.code);
        assert.equal(new Set(codes).size, codes.length);
        for (const map of definitions.filter((m) => m.type === MapType.DUNGEON)) {
            assert.ok((map.dungeon?.maxLevel ?? 0) > 0, map.code);
        }
        const minLevel = (code: string) => definitions.find((m) => m.code === code)?.minLevel;
        assert.equal(minLevel("greenfield_plains"), 1);
        assert.equal(minLevel("whispering_forest"), 10);
        assert.equal(minLevel("deep_evergrowth"), 20);
    });

    it("level cap dungeon: slime hollow 10, werewolf den 20, sanctuary of life 30", () => {
        const cap = (code: string) => definitions.find((m) => m.code === code)?.dungeon?.maxLevel;
        assert.deepEqual(
            [cap("slime_hollow"), cap("werewolf_den"), cap("sanctuary_of_life")],
            [10, 20, 30]
        );
    });
});

describe("content data", () => {
    it("quest seed hợp lệ theo schema", () => {
        for (const quest of QUESTS) QuestDefinitionSchema.parse(quest);
    });

    it("mọi tham chiếu chéo trong data seed đều tồn tại", () => {
        const errors = findContentRefErrors({
            maps: loadMapDefinitions(),
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
            itemCodes: new Set(["hp_potion_small", "spirit"]),
            monsterCodes: new Set(MONSTER_DEFINITIONS.map((monster) => monster.code)),
            dungeonDrops: DEFAULT_DUNGEON_DROP_CONFIG,
            dungeonMapCodes: new Set(
                loadMapDefinitions()
                    .filter((map) => map.type === MapType.DUNGEON)
                    .map((map) => map.code)
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
            dungeonMapCodes: new Set(),
            dungeonDrops: { byMap: {} },
        });
        assert.equal(errors.length, 1);
    });
});
