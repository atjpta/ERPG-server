import type { DateTime } from "luxon";
import type { FlagValue } from "@/modules/dialogues/schemas/condition.schema.js";
import { teleportService } from "@/modules/maps/services/teleport.service.js";
import type { PlayerDailyQuests } from "@/modules/quests/schemas/daily-quest.schema.js";
import type { PlayerQuestEntry, PlayerQuests } from "@/modules/quests/schemas/quest.schema.js";
import { questProgressService } from "@/modules/quests/services/quest-progress.service.js";
import { unlockService } from "@/modules/quests/services/unlock.service.js";
import type { PlayerSavedState } from "@/modules/player/types/player-fields.type.js";

/** Cột `player_states` mà nhật ký quest bọc (cờ cốt truyện, tiến độ quest, quest hằng ngày). */
export type QuestLogData = Pick<PlayerSavedState, "flags" | "quests" | "dailyQuests">;

/**
 * Cờ cốt truyện + tiến độ quest + quest hằng ngày của một player: bọc dữ liệu đã lưu (không đổi dạng lưu) và sửa thẳng trên nó.
 * Cờ còn dùng cho mở khoá chức năng (`unlock.<feature>`) và map đã đến (`visited.<map>`). Chỉ đổi dữ liệu; lưu / báo client là việc của owner.
 */
export class QuestLogState {
    constructor(private readonly data: QuestLogData) {}

    // ---- cờ ---------------------------------------------------------------------------------------------------------------------

    get flags(): Record<string, FlagValue> {
        return this.data.flags;
    }

    hasFlag(key: string): boolean {
        return Boolean(this.data.flags[key]);
    }

    setFlag(key: string, value: FlagValue = true): void {
        this.data.flags[key] = value;
    }

    /** Chức năng đã mở khoá (quest mở khoá ghi cờ `unlock.<feature>`). */
    isUnlocked(feature: string): boolean {
        return this.hasFlag(unlockService.unlockFlagKey(feature));
    }

    unlockFeature(feature: string): void {
        this.setFlag(unlockService.unlockFlagKey(feature));
    }

    unlockedFeatures(): string[] {
        return unlockService.unlockedFeatures(this.data.flags);
    }

    /** Đã đến map này chưa (điều kiện để teleport tới). */
    hasVisitedMap(mapCode: string): boolean {
        return teleportService.hasVisited(this.data.flags, mapCode);
    }

    visitMap(mapCode: string): void {
        this.setFlag(teleportService.visitedFlagKey(mapCode));
    }

    // ---- quest ------------------------------------------------------------------------------------------------------------------

    get quests(): PlayerQuests {
        return this.data.quests;
    }

    entryOf(questCode: string): PlayerQuestEntry | undefined {
        return this.data.quests[questCode];
    }

    /** Bắt đầu (hoặc làm lại) quest `questCode` từ `now`. */
    start(questCode: string, now: DateTime): PlayerQuestEntry {
        const entry = questProgressService.newQuestEntry(now);
        this.data.quests[questCode] = entry;
        return entry;
    }

    /** Bỏ tiến độ của quest (huỷ nhận / sang ngày mới). */
    drop(questCode: string): void {
        delete this.data.quests[questCode];
    }

    // ---- quest hằng ngày --------------------------------------------------------------------------------------------------------

    get dailyQuests(): PlayerDailyQuests | null {
        return this.data.dailyQuests;
    }

    /** Thay bộ quest hằng ngày: bỏ tiến độ của bộ cũ (`oldCodes`) rồi bắt đầu bộ mới từ `now`. */
    replaceDaily(daily: PlayerDailyQuests, oldCodes: readonly string[], now: DateTime): void {
        for (const code of oldCodes) this.drop(code);
        this.data.dailyQuests = daily;
        for (const def of daily.quests) this.start(def.code, now);
    }
}
