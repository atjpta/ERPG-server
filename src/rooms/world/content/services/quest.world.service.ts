import { DateTime } from "luxon";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import type { Quest } from "@/modules/quests/entities/quest.entity.js";
import {
    QuestCategory,
    QuestObjectiveType,
    QuestState,
} from "@/modules/quests/enums/quest.enum.js";
import {
    collectQuestTargets,
    npcMarkerFor,
} from "@/rooms/world/content/utils/quest-marker.world.util.js";
import { questOf, questsOf } from "@/rooms/world/content/utils/quest-resolve.world.util.js";
import {
    applyQuestEvent,
    canAcceptQuest,
    newQuestEntry,
    objectiveCurrent,
    type QuestEvent,
} from "@/modules/quests/services/quest-progress.service.js";
import { resolveRewardSpec } from "@/modules/rewards/services/reward-spec.service.js";
import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import type { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import { contentWorldService } from "@/rooms/world/content/services/content.world.service.js";
import { inventoryWorldService } from "@/rooms/world/inventory/services/inventory.world.service.js";
import { rewardWorldService } from "@/rooms/world/rewards/services/reward.world.service.js";
import { worldService } from "@/rooms/world/core/services/world.service.js";
import { TIME_ZONE } from "@/configs/time.config.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { DAILY_QUEST_CODES } from "@/modules/quests/schemas/daily-quest.schema.js";
import {
    dailyDateKey,
    generateDailyQuests,
    needsNewDailyQuests,
} from "@/modules/quests/services/daily-quest.service.js";
import { unlockedFeatures, unlockFlagKey } from "@/modules/quests/services/unlock.service.js";
import { worldEvents } from "@/rooms/world/core/utils/world-events.js";
import {
    WorldMessage,
    type FeaturesMessage,
    type NpcMarkersMessage,
    type QuestListMessage,
    type QuestPreviewMessage,
    type QuestTargetsMessage,
    type QuestMessage,
    type QuestUpdateMessage,
} from "@/rooms/world/world.message.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/** Lỗi nghiệp vụ trả về dạng chuỗi (giống các world service khác) hoặc `undefined` khi thành công. */
type QuestError = string | undefined;

/**
 * Quest của player đang online: nhận, tiến độ, trả thưởng. Trạng thái nằm ở `player.quests` (lưu
 * cùng checkpoint với túi đồ); nhận / trả quest lưu ngay để không mất thưởng khi thoát game.
 */
export class QuestWorldService {
    constructor() {
        // Mục tiêu `collect` tính theo túi: túi đổi thì báo lại tiến độ.
        worldEvents.onInventoryChanged((client, player) => this.onInventoryChanged(client, player));
    }

    private itemCount(player: PlayerWorldState) {
        return (code: string) => contentWorldService.itemCount(player, code);
    }

    toMessage(player: PlayerWorldState, quest: Quest): QuestMessage {
        const entry = player.quests[quest.code];
        return {
            code: quest.code,
            state: contentWorldService.questState(player, quest.code),
            category: quest.category,
            requiredLevel: quest.requiredLevel,
            giverNpcCode: quest.giverNpcCode,
            turnInNpcCode: quest.turnInNpcCode,
            rewards: {
                exp: quest.rewards.exp,
                currency: quest.rewards.currency,
                items: quest.rewards.items,
            },
            objectives: quest.objectives.map((objective) => ({
                id: objective.id,
                current: entry ? objectiveCurrent(objective, entry, this.itemCount(player)) : 0,
                count: objective.count,
            })),
        };
    }

    sendList(client: PlayerClient, player: PlayerWorldState) {
        const quests = Object.entries(player.quests).flatMap(([code, entry]) => {
            const quest = questOf(player, code);
            return quest && entry.status === "active" ? [this.toMessage(player, quest)] : [];
        });
        const message: QuestListMessage = { quests };
        client.send(WorldMessage.QUEST_LIST, message);
    }

    private sendUpdate(client: PlayerClient, player: PlayerWorldState, quest: Quest) {
        const message: QuestUpdateMessage = { quest: this.toMessage(player, quest) };
        client.send(WorldMessage.QUEST_UPDATE, message);
    }

    /** Xem trước 1 quest (mục tiêu + thưởng) — dùng ở thoại nhận quest và bảng nhiệm vụ. */
    sendPreview(client: PlayerClient, player: PlayerWorldState, questCode: string) {
        const quest = questOf(player, questCode);
        if (!quest) return;
        const message: QuestPreviewMessage = { quest: this.toMessage(player, quest) };
        client.send(WorldMessage.QUEST_PREVIEW, message);
    }

    /** Dấu trên đầu NPC của riêng player này (màu theo loại quest) — cũng dùng cho minimap. */
    sendMarkers(room: WorldRoom, client: PlayerClient, player: PlayerWorldState) {
        const ctx = contentWorldService.conditionContext(room, player);
        const now = DateTime.now();
        const quests = questsOf(player).map((quest) => {
            const entry = player.quests[quest.code];
            return {
                category: quest.category,
                giverNpcCode: quest.giverNpcCode,
                turnInNpcCode: quest.turnInNpcCode,
                objectives: quest.objectives,
                state: contentWorldService.questState(player, quest.code),
                acceptable: canAcceptQuest(quest, entry, ctx, now),
                doneObjectiveIds: new Set(
                    quest.objectives
                        .filter(
                            (objective) =>
                                entry &&
                                objectiveCurrent(objective, entry, this.itemCount(player)) >=
                                    objective.count
                        )
                        .map((objective) => objective.id)
                ),
            };
        });
        const markers = room.state.npcs.map((npc) => {
            const { marker, category } = npcMarkerFor(npc.code, quests);
            return { npcCode: npc.code, marker, ...(category ? { category } : {}) };
        });
        const message: NpcMarkersMessage = { markers };
        client.send(WorldMessage.NPC_MARKERS, message);
    }

    /** Quái / item / vật thể liên quan quest đang làm — client đánh chữ Q. */
    sendTargets(client: PlayerClient, player: PlayerWorldState) {
        const targets: QuestTargetsMessage = collectQuestTargets(
            questsOf(player).flatMap((quest) => {
                const entry = player.quests[quest.code];
                if (!entry) return [];
                return [
                    {
                        state: contentWorldService.questState(player, quest.code),
                        objectives: quest.objectives.map((objective) => ({
                            ...objective,
                            current: objectiveCurrent(objective, entry, this.itemCount(player)),
                        })),
                    },
                ];
            })
        );
        client.send(WorldMessage.QUEST_TARGETS, targets);
    }

    /**
     * Sang ngày mới (hoặc lần đầu) thì xoá 3 quest hằng ngày cũ và giao 3 quest mới theo level hiện tại.
     * Chỉ giao khi đã mở khoá `daily_quest` (hoàn thành quest đăng ký mạo hiểm giả). Trả `true` nếu có đổi.
     */
    ensureDaily(room: WorldRoom, sessionId: string, player: PlayerWorldState): boolean {
        if (!player.flags[unlockFlagKey("daily_quest")]) return false;
        const config = masterDataCacheService.get(MasterDataKey.DAILY_QUEST_CONFIG);
        const now = DateTime.now().setZone(TIME_ZONE);
        if (!needsNewDailyQuests(player.dailyQuests, now, config.resetHour)) return false;

        for (const code of DAILY_QUEST_CODES) delete player.quests[code];
        player.dailyQuests = {
            date: dailyDateKey(now, config.resetHour),
            quests: generateDailyQuests(config, player.level),
        };
        for (const def of player.dailyQuests.quests) player.quests[def.code] = newQuestEntry(now);
        void worldService.savePlayer(room, sessionId);
        return true;
    }

    /** Chức năng đã mở khoá (từ quest hero) — client bật/tắt menu tương ứng. */
    sendFeatures(client: PlayerClient, player: PlayerWorldState) {
        const message: FeaturesMessage = { features: unlockedFeatures(player.flags) };
        client.send(WorldMessage.FEATURES, message);
    }

    /** Vào room: gửi quest đang làm + dấu NPC. */
    sendInitial(room: WorldRoom, client: PlayerClient, player: PlayerWorldState) {
        this.ensureDaily(room, client.sessionId, player);
        this.sendFeatures(client, player);
        this.sendList(client, player);
        this.sendMarkers(room, client, player);
        this.sendTargets(client, player);
    }

    /** Nhận quest (từ action của dialogue) — kiểm điều kiện ở server. */
    start(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        questCode: string
    ): QuestError {
        const quest = questOf(player, questCode);
        if (!quest) return "Quest not found";
        // Quest hằng ngày được giao tự động, không nhận qua thoại.
        if (quest.category === QuestCategory.DAILY) return "Quest not available";
        const ctx = contentWorldService.conditionContext(room, player);
        if (!canAcceptQuest(quest, player.quests[questCode], ctx, DateTime.now())) {
            return "Quest not available";
        }
        player.quests[questCode] = newQuestEntry(DateTime.now());
        this.sendUpdate(client, player, quest);
        this.sendMarkers(room, client, player);
        this.sendTargets(client, player);
        return undefined;
    }

    /**
     * Trả quest tại NPC `turnInNpcCode`: đủ mục tiêu, còn chỗ túi cho thưởng → trừ item `collect`,
     * cộng thưởng, đánh dấu xong, lưu ngay.
     */
    complete(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        questCode: string,
        turnInNpcCode: string
    ): QuestError {
        const quest = questOf(player, questCode);
        const entry = player.quests[questCode];
        if (!quest || !entry) return "Quest not active";
        if (quest.turnInNpcCode !== turnInNpcCode) return "Wrong NPC";
        if (contentWorldService.questState(player, questCode) !== QuestState.READY) {
            return "Quest not completed";
        }

        const reward = resolveRewardSpec(quest.rewards, ItemSource.QUEST);
        // Túi đầy thì giữ quest để trả lại sau, thay vì làm mất đồ thưởng.
        if (!inventoryWorldService.canFit(player, reward.items)) return "Inventory full";

        for (const objective of quest.objectives) {
            if (objective.type !== QuestObjectiveType.COLLECT) continue;
            inventoryWorldService.takeByCode(player, objective.targetCode, objective.count);
        }
        entry.status = "completed";
        entry.completedAt = DateTime.now().toISO()!;
        for (const feature of quest.unlockFeatures) player.flags[unlockFlagKey(feature)] = true;
        rewardWorldService.grant(room, client.sessionId, player, reward);

        this.sendUpdate(client, player, quest);
        this.sendMarkers(room, client, player);
        this.sendTargets(client, player);
        if (quest.unlockFeatures.length > 0) {
            // Vừa mở quest hằng ngày thì giao luôn, không đợi tới lần đăng nhập sau.
            if (this.ensureDaily(room, client.sessionId, player)) this.sendList(client, player);
            this.sendFeatures(client, player);
        }
        inventoryWorldService.send(client, player);
        void worldService.savePlayer(room, client.sessionId);
        return undefined;
    }

    abandon(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        questCode: string
    ): QuestError {
        const quest = questOf(player, questCode);
        const entry = player.quests[questCode];
        if (!quest || entry?.status !== "active") return "Quest not active";
        if (quest.category === QuestCategory.DAILY) return "Cannot abandon a daily quest";
        delete player.quests[questCode];
        this.sendUpdate(client, player, quest);
        this.sendMarkers(room, client, player);
        this.sendTargets(client, player);
        return undefined;
    }

    /** Giết monster / nói chuyện / tương tác → cộng tiến độ cho quest đang làm. */
    onEvent(room: WorldRoom, sessionId: string, player: PlayerWorldState, event: QuestEvent) {
        const changed = applyQuestEvent(player.quests, (code) => questOf(player, code), event);
        if (changed.length === 0) return;
        const client = room.clients.getById(sessionId);
        if (!client) return;
        for (const code of changed) {
            const quest = questOf(player, code);
            if (quest) this.sendUpdate(client, player, quest);
        }
        this.sendMarkers(room, client, player);
        this.sendTargets(client, player);
    }

    private onInventoryChanged(client: PlayerClient, player: PlayerWorldState) {
        for (const [code, entry] of Object.entries(player.quests)) {
            if (entry.status !== "active") continue;
            const quest = questOf(player, code);
            if (quest?.objectives.some((o) => o.type === QuestObjectiveType.COLLECT)) {
                this.sendUpdate(client, player, quest);
            }
        }
    }
}

export const questWorldService = new QuestWorldService();
