import type { DateTime } from "luxon";
import type { Rng } from "@/modules/equipment/utils/equipment-roll.util.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import type { Quest } from "@/modules/quests/entities/quest.entity.js";
import {
    QuestCategory,
    QuestObjectiveType,
    QuestRepeat,
} from "@/modules/quests/enums/quest.enum.js";
import type {
    DailyQuestConfig,
    DailyQuestDef,
    PlayerDailyQuests,
} from "@/modules/quests/schemas/daily-quest.schema.js";
import type { RewardSpec } from "@/modules/rewards/schemas/reward-spec.schema.js";

/** NPC giao và nhận quest hằng ngày. */
export const DAILY_QUEST_NPC = "guild_officer";

/** Ngày "game" của thời điểm `now`: lùi `resetHour` giờ rồi lấy ngày, vd reset 4h thì 03:00 vẫn là hôm qua. */
export const dailyDateKey = (now: DateTime, resetHour: number): string =>
    now.minus({ hours: resetHour }).toISODate()!;

const pick = <T>(items: readonly T[], rng: Rng): T => items[Math.floor(rng() * items.length)];

const rewardOf = (rule: DailyQuestConfig["rewards"]["kill"], level: number): RewardSpec => ({
    exp: rule.expPerLevel * level,
    currency:
        rule.goldPerLevel > 0
            ? [{ code: CurrencyCode.GOLD, amount: rule.goldPerLevel * level }]
            : [],
    items: rule.items,
});

/** Bậc config áp dụng cho `level` (bậc có `minLevel` lớn nhất ≤ level; thấp hơn cả bậc đầu thì dùng bậc đầu). */
export const dailyTierFor = (config: DailyQuestConfig, level: number) => {
    const sorted = [...config.tiers].sort((a, b) => a.minLevel - b.minLevel);
    return sorted.filter((tier) => tier.minLevel <= level).at(-1) ?? sorted[0];
};

/** Sinh đúng 3 quest hằng ngày theo level hiện tại: 1 giết quái, 1 hầm ngục, 1 thu thập. */
export const generateDailyQuests = (
    config: DailyQuestConfig,
    level: number,
    rng: Rng = Math.random
): DailyQuestDef[] => {
    const tier = dailyTierFor(config, level);
    const kill = pick(tier.kill, rng);
    const dungeon = pick(tier.dungeon, rng);
    const collect = pick(tier.collect, rng);
    return [
        {
            code: "daily_kill",
            level,
            objective: {
                id: "kill",
                type: QuestObjectiveType.KILL,
                targetCode: kill.monsterCode,
                count: kill.count,
            },
            rewards: rewardOf(config.rewards.kill, level),
        },
        {
            code: "daily_dungeon",
            level,
            objective: {
                id: "dungeon",
                type: QuestObjectiveType.CLEAR_DUNGEON,
                targetCode: dungeon.mapCode,
                count: 1,
            },
            rewards: rewardOf(config.rewards.dungeon, level),
        },
        {
            code: "daily_collect",
            level,
            objective: {
                id: "collect",
                type: QuestObjectiveType.COLLECT,
                targetCode: collect.itemCode,
                count: collect.count,
            },
            rewards: rewardOf(config.rewards.collect, level),
        },
    ];
};

/** Player cần bộ quest mới không (chưa có, hoặc đã sang ngày mới). */
export const needsNewDailyQuests = (
    current: PlayerDailyQuests | null | undefined,
    now: DateTime,
    resetHour: number
): boolean => current?.date !== dailyDateKey(now, resetHour);

/** Quest hằng ngày dưới dạng `Quest` để dùng chung logic tiến độ / trả thưởng với quest thường. */
export const dailyQuestToQuest = (def: DailyQuestDef, npcCode = DAILY_QUEST_NPC): Quest => ({
    id: def.code,
    code: def.code,
    enabled: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    category: QuestCategory.DAILY,
    sortOrder: 0,
    chapter: 0,
    unlockFeatures: [],
    requiredLevel: def.level,
    prerequisiteQuestCodes: [],
    classCodes: [],
    giverNpcCode: npcCode,
    turnInNpcCode: npcCode,
    repeat: QuestRepeat.NONE,
    objectives: [def.objective],
    rewards: def.rewards,
    conditions: [],
});
