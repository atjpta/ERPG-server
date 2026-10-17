import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlayerDailyQuests } from "@/modules/quests/schemas/daily-quest.schema.js";
import { DateTime } from "luxon";
import { DEFAULT_DAILY_QUEST_CONFIG } from "@/modules/quests/seeds/daily-quest-config.seed-data.js";
import {
    DailyQuestConfigSchema,
    DAILY_QUEST_CODES,
} from "@/modules/quests/schemas/daily-quest.schema.js";
import { QuestObjectiveType, QuestCategory } from "@/modules/quests/enums/quest.enum.js";
import {
    dailyDateKey,
    dailyQuestToQuest,
    dailyTierFor,
    generateDailyQuests,
    needsNewDailyQuests,
} from "@/modules/quests/services/daily-quest.service.js";

const config = DEFAULT_DAILY_QUEST_CONFIG;

describe("daily quest config", () => {
    it("mặc định hợp lệ theo schema", () => {
        assert.doesNotThrow(() => DailyQuestConfigSchema.parse(config));
    });

    it("chọn bậc theo level: bậc cao nhất có minLevel <= level", () => {
        assert.equal(dailyTierFor(config, 1).minLevel, 1);
        assert.equal(dailyTierFor(config, 9).minLevel, 1);
        assert.equal(dailyTierFor(config, 10).minLevel, 10);
        assert.equal(dailyTierFor(config, 35).minLevel, 20);
    });
});

describe("generateDailyQuests", () => {
    it("đúng 3 quest: giết quái, hầm ngục, thu thập — theo thứ tự cố định", () => {
        const quests = generateDailyQuests(config, 5, () => 0);
        assert.deepEqual(
            quests.map((quest) => quest.code),
            [...DAILY_QUEST_CODES]
        );
        assert.deepEqual(
            quests.map((quest) => quest.objective.type),
            [QuestObjectiveType.KILL, QuestObjectiveType.CLEAR_DUNGEON, QuestObjectiveType.COLLECT]
        );
    });

    it("nội dung theo bậc level của player", () => {
        const low = generateDailyQuests(config, 5, () => 0);
        assert.equal(low[1].objective.targetCode, "slime_hollow");
        const mid = generateDailyQuests(config, 12, () => 0);
        assert.equal(mid[1].objective.targetCode, "werewolf_den");
        const high = generateDailyQuests(config, 25, () => 0);
        assert.equal(high[1].objective.targetCode, "sanctuary_of_life");
    });

    it("thưởng scale theo level", () => {
        const [at5] = generateDailyQuests(config, 5, () => 0);
        const [at10] = generateDailyQuests(config, 10, () => 0);
        assert.equal(at10.rewards.exp, at5.rewards.exp * 2);
    });

    it("rng chọn phương án khác nhau trong cùng bậc", () => {
        const first = generateDailyQuests(config, 1, () => 0)[0].objective.targetCode;
        const last = generateDailyQuests(config, 1, () => 0.99)[0].objective.targetCode;
        assert.notEqual(first, last);
    });

    it("chuyển thành Quest dùng chung logic tiến độ", () => {
        const [kill] = generateDailyQuests(config, 3, () => 0);
        const quest = dailyQuestToQuest(kill);
        assert.equal(quest.category, QuestCategory.DAILY);
        assert.equal(quest.turnInNpcCode, "guild_officer");
        assert.deepEqual(quest.objectives, [kill.objective]);
    });
});

describe("daily reset", () => {
    const at = (iso: string) => DateTime.fromISO(iso);

    it("ngày game lùi theo resetHour", () => {
        assert.equal(dailyDateKey(at("2026-01-10T03:00:00"), 4), "2026-01-09");
        assert.equal(dailyDateKey(at("2026-01-10T04:00:00"), 4), "2026-01-10");
        assert.equal(dailyDateKey(at("2026-01-10T00:30:00"), 0), "2026-01-10");
    });

    it("cần sinh mới khi chưa có hoặc sang ngày mới, không sinh lại trong cùng ngày", () => {
        const today: PlayerDailyQuests = { date: "2026-01-10", quests: [] };
        assert.ok(needsNewDailyQuests(null, at("2026-01-10T08:00:00"), 0));
        assert.ok(!needsNewDailyQuests(today, at("2026-01-10T23:59:00"), 0));
        assert.ok(needsNewDailyQuests(today, at("2026-01-11T00:01:00"), 0));
    });
});
