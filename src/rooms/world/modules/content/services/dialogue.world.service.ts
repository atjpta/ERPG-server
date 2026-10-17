import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import type { Action } from "@/modules/dialogues/schemas/condition.schema.js";
import type { DialogueNode } from "@/modules/dialogues/schemas/dialogue.schema.js";
import { evaluateConditions } from "@/modules/dialogues/services/condition.service.js";
import { nodeTextKey, optionTextKey } from "@/modules/dialogues/services/dialogue-graph.service.js";
import { dialogueService } from "@/modules/dialogues/services/dialogue.service.js";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { npcService } from "@/modules/npcs/services/npc.service.js";
import { debitWallet } from "@/modules/player/services/player-progress.service.js";
import { QuestObjectiveType } from "@/modules/quests/enums/quest.enum.js";
import { contentWorldService } from "@/rooms/world/modules/content/services/content.world.service.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import { inventoryWorldService } from "@/rooms/world/modules/inventory/services/inventory.world.service.js";
import { transferWorldService } from "@/rooms/world/modules/maps/services/transfer.world.service.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { rewardWorldService } from "@/rooms/world/modules/rewards/services/reward.world.service.js";
import {
    WorldMessage,
    type DialogueEndMessage,
    type DialogueMessage,
    type NpcFunctionOpenMessage,
    type WalletMessage,
} from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/** Cuộc thoại đang mở của 1 player (chỉ ở server — client chỉ gửi optionId). */
interface DialogueSession {
    /** NPC code, hoặc id vật thể (biển báo). */
    sourceCode: string;
    /** Có = đang nói chuyện với NPC (cho action `open_function`, trả quest). */
    npcCode?: string;
    dialogueCode: string;
    nodeId: string;
    x: number;
    y: number;
    radius: number;
}

/** Đứng xa hơn bán kính mở thoại cộng chừng này thì đóng thoại. */
export const RANGE_MARGIN = 0.5;

export class DialogueWorldService {
    private readonly sessions = new WeakMap<WorldRoom, Map<string, DialogueSession>>();

    sessionsOf(room: WorldRoom) {
        let map = this.sessions.get(room);
        if (!map) this.sessions.set(room, (map = new Map()));
        return map;
    }

    /** Biển báo / vật thể có thoại (không có NPC). */
    startSource(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        source: { id: string; x: number; y: number; radius: number; dialogueCode: string }
    ): string | undefined {
        if (!dialogueService.getByCode(source.dialogueCode)) return "No dialogue";
        this.begin(room, client, player, {
            sourceCode: source.id,
            dialogueCode: source.dialogueCode,
            nodeId: "start",
            x: source.x,
            y: source.y,
            radius: source.radius,
        });
        return undefined;
    }

    /**
     * Mỗi tick: ai đang mở thoại mà đã đứng quá xa nơi nói chuyện thì đóng thoại luôn (client chỉ ẩn hộp thoại,
     * không có thông báo lỗi).
     */
    tick(room: WorldRoom): void {
        const sessions = this.sessionsOf(room);
        if (sessions.size === 0) return;
        for (const [sessionId, session] of sessions) {
            const player = room.state.players.get(sessionId);
            const client = room.clients.getById(sessionId) as PlayerClient | undefined;
            if (!player || !client) continue;
            if (
                contentWorldService.isNear(
                    player,
                    session.x,
                    session.y,
                    session.radius + RANGE_MARGIN
                )
            )
                continue;
            this.end(room, client, session.sourceCode);
        }
    }

    /** Player rời room: bỏ phiên thoại. */
    drop(room: WorldRoom, sessionId: string) {
        this.sessionsOf(room).delete(sessionId);
    }

    begin(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        session: DialogueSession
    ) {
        this.sessionsOf(room).set(client.sessionId, session);
        this.enter(room, client, player, session, session.nodeId);
    }

    enter(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        session: DialogueSession,
        nodeId: string
    ) {
        const node = dialogueService.getNode(session.dialogueCode, nodeId);
        if (!node) {
            this.end(room, client, session.sourceCode, "Dialogue not found");
            return;
        }
        session.nodeId = nodeId;
        const error = this.runActions(room, client, player, session, node.actions);
        if (error) {
            this.end(room, client, session.sourceCode, error);
            return;
        }
        if (!this.sessionsOf(room).has(client.sessionId)) return;
        this.send(room, client, player, session, node);
    }

    private send(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        session: DialogueSession,
        node: DialogueNode
    ) {
        const ctx = contentWorldService.conditionContext(room, player);
        const options = (node.options ?? []).flatMap((option) => {
            const enabled = evaluateConditions(ctx, option.conditions);
            if (!enabled && option.hideIfFail) return [];
            return [
                {
                    id: option.id,
                    textKey: optionTextKey(session.dialogueCode, node.id, option),
                    enabled,
                },
            ];
        });
        const message: DialogueMessage = {
            sourceCode: session.sourceCode,
            dialogueCode: session.dialogueCode,
            nodeId: node.id,
            textKey: nodeTextKey(session.dialogueCode, node),
            ...(node.speakerKey ? { speakerKey: node.speakerKey } : {}),
            options,
            hasNext: options.length === 0 && !!node.next,
            offerQuestCodes: (node.options ?? []).flatMap((option) =>
                (option.actions ?? []).flatMap((action) =>
                    action.type === "start_quest" ? [action.questCode] : []
                )
            ),
        };
        client.send(WorldMessage.DIALOGUE, message);
    }

    end(room: WorldRoom, client: PlayerClient, sourceCode: string, error?: string) {
        this.sessionsOf(room).delete(client.sessionId);
        const message: DialogueEndMessage = { sourceCode, ...(error ? { error } : {}) };
        client.send(WorldMessage.DIALOGUE_END, message);
    }

    /** Chạy lần lượt; action lỗi thì dừng và trả lỗi (các action trước đó giữ nguyên hiệu lực). */
    runActions(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        session: DialogueSession,
        actions: readonly Action[] | undefined
    ): string | undefined {
        for (const action of actions ?? []) {
            const error = this.runAction(room, client, player, session, action);
            if (error) return error;
        }
        return undefined;
    }

    private runAction(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        session: DialogueSession,
        action: Action
    ): string | undefined {
        switch (action.type) {
            case "start_quest":
                return questWorldService.start(room, client, player, action.questCode);
            case "complete_quest":
                // Chỉ trả được tại đúng NPC nhận trả quest.
                return questWorldService.complete(
                    room,
                    client,
                    player,
                    action.questCode,
                    session.npcCode ?? ""
                );
            case "give_item": {
                const item = itemService.getByCode(action.itemCode);
                if (!item) return "Item not found";
                const items = [{ itemId: item.id, quantity: action.quantity }];
                if (!inventoryWorldService.canFit(player, items)) return "Inventory full";
                inventoryWorldService.grantItems(client, player, items, ItemSource.QUEST);
                return undefined;
            }
            case "take_item": {
                if (!inventoryWorldService.takeByCode(player, action.itemCode, action.quantity)) {
                    return "Not enough items";
                }
                inventoryWorldService.send(client, player);
                return undefined;
            }
            case "give_currency":
                rewardWorldService.grant(room, client.sessionId, player, {
                    exp: 0,
                    currency: [{ code: action.currency, amount: action.amount }],
                    items: [],
                    source: ItemSource.QUEST,
                });
                return undefined;
            case "take_currency": {
                const wallet = debitWallet(player.wallet, [
                    { code: action.currency, amount: action.amount },
                ]);
                if (!wallet) return "Not enough currency";
                player.wallet = wallet;
                const message: WalletMessage = player.wallet;
                client.send(WorldMessage.WALLET, message);
                return undefined;
            }
            case "set_flag":
                player.flags[action.key] = action.value;
                return undefined;
            case "heal":
                player.restoreFull();
                return undefined;
            case "teleport":
                // Chuyển xong thì thoại kết thúc; lỗi thì báo lại.
                void transferWorldService
                    .transfer(room, client, player, action.mapCode, action.spawnId)
                    .then((error) => this.end(room, client, session.sourceCode, error));
                return undefined;
            case "open_function": {
                const fn = npcService
                    .getByCode(session.npcCode ?? "")
                    ?.functions.find((f) => f.id === action.function);
                if (!fn || !session.npcCode) return "Function not found";
                const message: NpcFunctionOpenMessage = {
                    npcCode: session.npcCode,
                    functionId: fn.id,
                    type: fn.type,
                    config: JSON.stringify(fn.config),
                };
                client.send(WorldMessage.NPC_FUNCTION_OPEN, message);
                return undefined;
            }
            case "talk":
                if (session.npcCode) {
                    questWorldService.onEvent(room, client.sessionId, player, {
                        type: QuestObjectiveType.TALK,
                        targetCode: session.npcCode,
                    });
                }
                return undefined;
        }
    }
}

export const dialogueWorldService = new DialogueWorldService();
