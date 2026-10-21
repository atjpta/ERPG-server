import { QuestCode } from "@/modules/quests/enums/quest-code.enum.js";
import type { DateTime } from "luxon";
import type { Rng } from "@/modules/equipment/services/equipment-roll.service.js";
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

export class DailyQuestService {
    /** Ngày "game" của thời điểm `now`: lùi `resetHour` giờ rồi lấy ngày, vd reset 4h thì 03:00 vẫn là hôm qua. */
    dailyDateKey(now: DateTime, resetHour: number): string {
        return now.minus({ hours: resetHour }).toISODate()!;
    }

    private pick<T>(items: readonly T[], rng: Rng): T {
        return items[Math.floor(rng() * items.length)];
    }

    private rewardOf(rule: DailyQuestConfig["rewards"]["kill"], level: number): RewardSpec {
        return {
            exp: rule.expPerLevel * level,
            currency:
                rule.goldPerLevel > 0
                    ? [{ code: CurrencyCode.GOLD, amount: rule.goldPerLevel * level }]
                    : [],
            items: rule.items,
        };
    }

    /** Bậc config áp dụng cho `level` (bậc có `minLevel` lớn nhất ≤ level; thấp hơn cả bậc đầu thì dùng bậc đầu). */
    dailyTierFor(config: DailyQuestConfig, level: number) {
        const sorted = [...config.tiers].sort((a, b) => a.minLevel - b.minLevel);
        return sorted.filter((tier) => tier.minLevel <= level).at(-1) ?? sorted[0];
    }

    /** Sinh đúng 3 quest hằng ngày theo level hiện tại: 1 giết quái, 1 hầm ngục, 1 thu thập. */
    generateDailyQuests(
        config: DailyQuestConfig,
        level: number,
        rng: Rng = Math.random
    ): DailyQuestDef[] {
        const tier = this.dailyTierFor(config, level);
        const kill = this.pick(tier.kill, rng);
        const dungeon = this.pick(tier.dungeon, rng);
        const collect = this.pick(tier.collect, rng);
        return [
            {
                code: QuestCode.DAILY_KILL,
                level,
                objective: {
                    id: "kill",
                    type: QuestObjectiveType.KILL,
                    targetCode: kill.monsterCode,
                    count: kill.count,
                },
                rewards: this.rewardOf(config.rewards.kill, level),
            },
            {
                code: QuestCode.DAILY_DUNGEON,
                level,
                objective: {
                    id: "dungeon",
                    type: QuestObjectiveType.CLEAR_DUNGEON,
                    targetCode: dungeon.mapCode,
                    count: 1,
                },
                rewards: this.rewardOf(config.rewards.dungeon, level),
            },
            {
                code: QuestCode.DAILY_COLLECT,
                level,
                objective: {
                    id: "collect",
                    type: QuestObjectiveType.COLLECT,
                    targetCode: collect.itemCode,
                    count: collect.count,
                },
                rewards: this.rewardOf(config.rewards.collect, level),
            },
        ];
    }

    /** Player cần bộ quest mới không (chưa có, hoặc đã sang ngày mới). */
    needsNewDailyQuests(
        current: PlayerDailyQuests | null | undefined,
        now: DateTime,
        resetHour: number
    ): boolean {
        return current?.date !== this.dailyDateKey(now, resetHour);
    }

    /** Quest hằng ngày dưới dạng `Quest` để dùng chung logic tiến độ / trả thưởng với quest thường. */
    dailyQuestToQuest(def: DailyQuestDef, npcCode = DAILY_QUEST_NPC): Quest {
        return {
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
        };
    }
}

export const dailyQuestService = new DailyQuestService();
