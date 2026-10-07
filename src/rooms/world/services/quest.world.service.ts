import { DateTime } from "luxon";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import type { Quest } from "@/modules/quests/entities/quest.entity.js";
import { QuestObjectiveType, QuestState } from "@/modules/quests/enums/quest.enum.js";
import { questService } from "@/modules/quests/services/quest.service.js";
import {
    applyQuestEvent,
    canAcceptQuest,
    newQuestEntry,
    objectiveCurrent,
    type QuestEvent,
} from "@/modules/quests/utils/quest-progress.util.js";
import { resolveRewardSpec } from "@/modules/rewards/utils/reward-spec.util.js";
import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import type { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import { contentWorldService } from "@/rooms/world/services/content.world.service.js";
import { inventoryWorldService } from "@/rooms/world/services/inventory.world.service.js";
import { rewardWorldService } from "@/rooms/world/services/reward.world.service.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import { worldEvents } from "@/rooms/world/utils/world-events.js";
import {
    NpcMarker,
    WorldMessage,
    type NpcMarkersMessage,
    type QuestListMessage,
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
            objectives: quest.objectives.map((objective) => ({
                id: objective.id,
                current: entry ? objectiveCurrent(objective, entry, this.itemCount(player)) : 0,
                count: objective.count,
            })),
        };
    }

    sendList(client: PlayerClient, player: PlayerWorldState) {
        const quests = Object.entries(player.quests).flatMap(([code, entry]) => {
            const quest = questService.getByCode(code);
            return quest && entry.status === "active" ? [this.toMessage(player, quest)] : [];
        });
        const message: QuestListMessage = { quests };
        client.send(WorldMessage.QUEST_LIST, message);
    }

    private sendUpdate(client: PlayerClient, player: PlayerWorldState, quest: Quest) {
        const message: QuestUpdateMessage = { quest: this.toMessage(player, quest) };
        client.send(WorldMessage.QUEST_UPDATE, message);
    }

    /** Dấu trên đầu NPC của riêng player này: trả > đang làm > nhận. */
    sendMarkers(room: WorldRoom, client: PlayerClient, player: PlayerWorldState) {
        const ctx = contentWorldService.conditionContext(room, player);
        const now = DateTime.now();
        const markers = room.state.npcs.map((npc) => {
            let marker = NpcMarker.NONE;
            for (const quest of questService.list()) {
                const state = contentWorldService.questState(player, quest.code);
                if (quest.turnInNpcCode === npc.code && state === QuestState.READY) {
                    marker = NpcMarker.READY;
                    break;
                }
                if (quest.turnInNpcCode === npc.code && state === QuestState.ACTIVE) {
                    marker = NpcMarker.IN_PROGRESS;
                } else if (
                    quest.giverNpcCode === npc.code &&
                    marker === NpcMarker.NONE &&
                    canAcceptQuest(quest, player.quests[quest.code], ctx, now)
                ) {
                    marker = NpcMarker.AVAILABLE;
                }
            }
            return { npcCode: npc.code, marker };
        });
        const message: NpcMarkersMessage = { markers };
        client.send(WorldMessage.NPC_MARKERS, message);
    }

    /** Vào room: gửi quest đang làm + dấu NPC. */
    sendInitial(room: WorldRoom, client: PlayerClient, player: PlayerWorldState) {
        this.sendList(client, player);
        this.sendMarkers(room, client, player);
    }

    /** Nhận quest (từ action của dialogue) — kiểm điều kiện ở server. */
    start(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        questCode: string
    ): QuestError {
        const quest = questService.getByCode(questCode);
        if (!quest) return "Quest not found";
        const ctx = contentWorldService.conditionContext(room, player);
        if (!canAcceptQuest(quest, player.quests[questCode], ctx, DateTime.now())) {
            return "Quest not available";
        }
        player.quests[questCode] = newQuestEntry(DateTime.now());
        this.sendUpdate(client, player, quest);
        this.sendMarkers(room, client, player);
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
        const quest = questService.getByCode(questCode);
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
        rewardWorldService.grant(room, client.sessionId, player, reward);

        this.sendUpdate(client, player, quest);
        this.sendMarkers(room, client, player);
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
        const quest = questService.getByCode(questCode);
        const entry = player.quests[questCode];
        if (!quest || entry?.status !== "active") return "Quest not active";
        delete player.quests[questCode];
        this.sendUpdate(client, player, quest);
        this.sendMarkers(room, client, player);
        return undefined;
    }

    /** Giết monster / nói chuyện / tương tác → cộng tiến độ cho quest đang làm. */
    onEvent(room: WorldRoom, sessionId: string, player: PlayerWorldState, event: QuestEvent) {
        const changed = applyQuestEvent(
            player.quests,
            (code) => questService.getByCode(code),
            event
        );
        if (changed.length === 0) return;
        const client = room.clients.getById(sessionId);
        if (!client) return;
        for (const code of changed) {
            const quest = questService.getByCode(code);
            if (quest) this.sendUpdate(client, player, quest);
        }
        this.sendMarkers(room, client, player);
    }

    private onInventoryChanged(client: PlayerClient, player: PlayerWorldState) {
        for (const [code, entry] of Object.entries(player.quests)) {
            if (entry.status !== "active") continue;
            const quest = questService.getByCode(code);
            if (quest?.objectives.some((o) => o.type === QuestObjectiveType.COLLECT)) {
                this.sendUpdate(client, player, quest);
            }
        }
    }
}

export const questWorldService = new QuestWorldService();
