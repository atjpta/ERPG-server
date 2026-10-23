import type { ErrorCode } from "@/core/types/result.type.js";
import { QuestErrorCode } from "@/modules/quests/enums/quest-error-code.enum.js";
import { TIME_ZONE } from "@/configs/time.config.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import type { Quest } from "@/modules/quests/entities/quest.entity.js";
import {
    QuestCategory,
    QuestObjectiveType,
    QuestState,
} from "@/modules/quests/enums/quest.enum.js";
import { DAILY_QUEST_CODES } from "@/modules/quests/schemas/daily-quest.schema.js";
import { dailyQuestService } from "@/modules/quests/services/daily-quest.service.js";
import {
    type QuestEvent,
    questProgressService,
} from "@/modules/quests/services/quest-progress.service.js";
import { unlockService } from "@/modules/quests/services/unlock.service.js";
import { rewardSpecService } from "@/modules/rewards/services/reward-spec.service.js";
import {
    collectQuestTargets,
    npcMarkerFor,
} from "@/rooms/world/modules/content/utils/quest-marker.world.util.js";
import { questOf, questsOf } from "@/rooms/world/modules/content/utils/quest-resolve.world.util.js";
import { playerDataWorldService } from "@/rooms/world/modules/players/services/player-data.world.service.js";
import type { PlayerChangeOp } from "@/rooms/world/modules/players/types/player-change.world.type.js";
import { Response } from "@/core/utils/response.util.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { rewardWorldService } from "@/rooms/world/modules/rewards/services/reward.world.service.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import { worldEvents } from "@/rooms/world/utils/world-events.js";
import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type {
    FeaturesMessage,
    NpcMarkersMessage,
    QuestListMessage,
    QuestMessage,
    QuestTargetsMessage,
    QuestUpdateMessage,
} from "@/rooms/world/modules/content/interfaces/content.world.message.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { DateTime } from "luxon";

/** Lỗi nghiệp vụ trả về dạng chuỗi (giống các world service khác) hoặc `undefined` khi thành công. */
export type QuestError = ErrorCode | undefined;

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
        return (code: string) => player.itemCount(code);
    }

    toMessage(player: PlayerWorldState, quest: Quest): QuestMessage {
        const entry = player.quests[quest.code];
        return {
            code: quest.code,
            state: player.questState(quest.code),
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
                current: entry
                    ? questProgressService.objectiveCurrent(
                          objective,
                          entry,
                          this.itemCount(player)
                      )
                    : 0,
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
        client.sendSuccess(WorldMessage.QUEST_LIST, message);
    }

    sendUpdate(client: PlayerClient, player: PlayerWorldState, quest: Quest) {
        const message: QuestUpdateMessage = { quest: this.toMessage(player, quest) };
        client.sendSuccess(WorldMessage.QUEST_UPDATE, message);
    }

    /** Dấu trên đầu NPC của riêng player này (màu theo loại quest) — cũng dùng cho minimap. */
    sendMarkers(room: WorldRoom, client: PlayerClient, player: PlayerWorldState) {
        const ctx = player.conditionContext(room.map.code);
        const now = DateTime.now();
        const quests = questsOf(player).map((quest) => {
            const entry = player.quests[quest.code];
            return {
                category: quest.category,
                giverNpcCode: quest.giverNpcCode,
                turnInNpcCode: quest.turnInNpcCode,
                objectives: quest.objectives,
                state: player.questState(quest.code),
                acceptable: questProgressService.canAcceptQuest(quest, entry, ctx, now),
                doneObjectiveIds: new Set(
                    quest.objectives
                        .filter(
                            (objective) =>
                                entry &&
                                questProgressService.objectiveCurrent(
                                    objective,
                                    entry,
                                    this.itemCount(player)
                                ) >= objective.count
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
        client.sendSuccess(WorldMessage.NPC_MARKERS, message);
    }

    /** Quái / item / vật thể liên quan quest đang làm — client đánh chữ Q. */
    sendTargets(client: PlayerClient, player: PlayerWorldState) {
        const targets: QuestTargetsMessage = collectQuestTargets(
            questsOf(player).flatMap((quest) => {
                const entry = player.quests[quest.code];
                if (!entry) return [];
                return [
                    {
                        state: player.questState(quest.code),
                        objectives: quest.objectives.map((objective) => ({
                            ...objective,
                            current: questProgressService.objectiveCurrent(
                                objective,
                                entry,
                                this.itemCount(player)
                            ),
                        })),
                    },
                ];
            })
        );
        client.sendSuccess(WorldMessage.QUEST_TARGETS, targets);
    }

    /**
     * Sang ngày mới (hoặc lần đầu) thì xoá 3 quest hằng ngày cũ và giao 3 quest mới theo level hiện tại.
     * Chỉ giao khi đã mở khoá `daily_quest` (hoàn thành quest đăng ký mạo hiểm giả). Trả `true` nếu có đổi.
     */
    ensureDaily(room: WorldRoom, playerId: string, player: PlayerWorldState): boolean {
        if (!player.flags[unlockService.unlockFlagKey("daily_quest")]) return false;
        const config = masterDataCacheService.get(MasterDataKey.DAILY_QUEST_CONFIG);
        const now = DateTime.now().setZone(TIME_ZONE);
        if (!dailyQuestService.needsNewDailyQuests(player.dailyQuests, now, config.resetHour))
            return false;

        for (const code of DAILY_QUEST_CODES) delete player.quests[code];
        player.dailyQuests = {
            date: dailyQuestService.dailyDateKey(now, config.resetHour),
            quests: dailyQuestService.generateDailyQuests(config, player.level),
        };
        for (const def of player.dailyQuests.quests)
            player.quests[def.code] = questProgressService.newQuestEntry(now);
        void worldService.savePlayer(room, playerId);
        return true;
    }

    /** Chức năng đã mở khoá (từ quest hero) — client bật/tắt menu tương ứng. */
    sendFeatures(client: PlayerClient, player: PlayerWorldState) {
        const message: FeaturesMessage = { features: unlockService.unlockedFeatures(player.flags) };
        client.sendSuccess(WorldMessage.FEATURES, message);
    }

    /** Vào room: gửi quest đang làm + dấu NPC. */
    sendInitial(room: WorldRoom, client: PlayerClient, player: PlayerWorldState) {
        this.ensureDaily(room, client.auth.playerId, player);
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
        if (!quest) return QuestErrorCode.QUEST_NOT_FOUND;
        // Quest hằng ngày được giao tự động, không nhận qua thoại.
        if (quest.category === QuestCategory.DAILY) return QuestErrorCode.QUEST_NOT_AVAILABLE;
        const ctx = player.conditionContext(room.map.code);
        if (
            !questProgressService.canAcceptQuest(
                quest,
                player.quests[questCode],
                ctx,
                DateTime.now()
            )
        ) {
            return QuestErrorCode.QUEST_NOT_AVAILABLE;
        }
        player.quests[questCode] = questProgressService.newQuestEntry(DateTime.now());
        this.sendUpdate(client, player, quest);
        this.sendMarkers(room, client, player);
        this.sendTargets(client, player);
        return undefined;
    }

    /**
     * Trả quest tại NPC `turnInNpcCode`: đủ mục tiêu, còn chỗ túi cho thưởng → trừ item `collect`,
     * cộng thưởng, đánh dấu xong, lưu ngay.
     */
    async complete(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        questCode: string,
        turnInNpcCode: string
    ): Promise<QuestError> {
        const quest = questOf(player, questCode);
        const entry = player.quests[questCode];
        if (!quest || !entry) return QuestErrorCode.QUEST_NOT_ACTIVE;
        if (quest.turnInNpcCode !== turnInNpcCode) return QuestErrorCode.QUEST_WRONG_NPC;
        if (player.questState(questCode) !== QuestState.READY) {
            return QuestErrorCode.QUEST_NOT_COMPLETED;
        }

        const reward = rewardSpecService.resolveRewardSpec(quest.rewards, ItemSource.QUEST);
        // Trừ item `collect` và cộng thưởng trong một lần nguyên tử ở global; túi đầy thì giữ quest để trả lại sau,
        // thay vì làm mất đồ thưởng.
        const ops: PlayerChangeOp[] = quest.objectives.flatMap((objective) =>
            objective.type === QuestObjectiveType.COLLECT
                ? [
                      {
                          type: "takeItem" as const,
                          itemCode: objective.targetCode,
                          quantity: objective.count,
                      },
                  ]
                : []
        );
        if (reward.items.length > 0) {
            ops.push({
                type: "giveItem",
                items: reward.items,
                source: reward.source,
                requireFit: true,
            });
        }
        if (ops.length > 0) {
            const applied = playerDataWorldService.apply(player, ops);
            if (Response.isError(applied)) return applied.code;
        }
        entry.status = "completed";
        entry.completedAt = DateTime.now().toISO()!;
        for (const feature of quest.unlockFeatures)
            player.flags[unlockService.unlockFlagKey(feature)] = true;
        rewardWorldService.grant(room, client.auth.playerId, player, reward, false, false);

        this.sendUpdate(client, player, quest);
        this.sendMarkers(room, client, player);
        this.sendTargets(client, player);
        if (quest.unlockFeatures.length > 0) {
            // Vừa mở quest hằng ngày thì giao luôn, không đợi tới lần đăng nhập sau.
            if (this.ensureDaily(room, client.auth.playerId, player)) this.sendList(client, player);
            this.sendFeatures(client, player);
        }
        void worldService.savePlayer(room, client.auth.playerId);
        return undefined;
    }

    /** Giết monster / nói chuyện / tương tác → cộng tiến độ cho quest đang làm. */
    onEvent(room: WorldRoom, playerId: string, player: PlayerWorldState, event: QuestEvent) {
        const changed = questProgressService.applyQuestEvent(
            player.quests,
            (code) => questOf(player, code),
            event
        );
        if (changed.length === 0) return;
        const client = room.clientOf(playerId);
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
