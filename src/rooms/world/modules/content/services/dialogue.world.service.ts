import type { ErrorCode } from "@/core/types/result.type.js";
import { NpcErrorCode } from "@/modules/npcs/enums/npc-error-code.enum.js";
import { Response } from "@/core/utils/response.util.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { DialogueErrorCode } from "@/modules/dialogues/enums/dialogue-error-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import type { Action } from "@/modules/dialogues/schemas/condition.schema.js";
import type { DialogueNode } from "@/modules/dialogues/schemas/dialogue.schema.js";
import { conditionService } from "@/modules/dialogues/services/condition.service.js";
import { dialogueGraphService } from "@/modules/dialogues/services/dialogue-graph.service.js";
import { dialogueService } from "@/modules/dialogues/services/dialogue.service.js";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { npcService } from "@/modules/npcs/services/npc.service.js";
import { QuestObjectiveType } from "@/modules/quests/enums/quest.enum.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import { playerDataWorldService } from "@/rooms/world/modules/players/services/player-data.world.service.js";
import { transferWorldService } from "@/rooms/world/modules/maps/services/transfer.world.service.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { rewardWorldService } from "@/rooms/world/modules/rewards/services/reward.world.service.js";
import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type {
    DialogueEndMessage,
    DialogueMessage,
    NpcFunctionOpenMessage,
} from "@/rooms/world/modules/content/interfaces/content.world.message.js";
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
    ): Promise<ErrorCode | undefined> {
        if (!dialogueService.getByCode(source.dialogueCode))
            return Promise.resolve(DialogueErrorCode.DIALOGUE_NOT_FOUND);
        return this.begin(room, client, player, {
            sourceCode: source.id,
            dialogueCode: source.dialogueCode,
            nodeId: "start",
            x: source.x,
            y: source.y,
            radius: source.radius,
        });
    }

    /**
     * Mỗi tick: ai đang mở thoại mà đã đứng quá xa nơi nói chuyện thì đóng thoại luôn (client chỉ ẩn hộp thoại,
     * không có thông báo lỗi).
     */
    tick(room: WorldRoom): void {
        const sessions = this.sessionsOf(room);
        if (sessions.size === 0) return;
        for (const [playerId, session] of sessions) {
            const player = room.state.players.get(playerId);
            const client = room.clientOf(playerId);
            if (!player || !client) continue;
            if (player.isNear(session.x, session.y, session.radius + RANGE_MARGIN)) continue;
            this.end(room, client, session.sourceCode);
        }
    }

    /** Player rời room: bỏ phiên thoại. */
    drop(room: WorldRoom, playerId: string) {
        this.sessionsOf(room).delete(playerId);
    }

    begin(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        session: DialogueSession
    ): Promise<ErrorCode | undefined> {
        this.sessionsOf(room).set(client.auth.playerId, session);
        return this.enter(room, client, player, session, session.nodeId);
    }

    /**
     * Vào node `nodeId` và đẩy `dialogue` cho client. Lỗi thì đóng phiên và trả mã lỗi để command báo lại
     * qua response của request (không đẩy `dialogueEnd`).
     */
    async enter(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        session: DialogueSession,
        nodeId: string
    ): Promise<ErrorCode | undefined> {
        const sessions = this.sessionsOf(room);
        const node = dialogueService.getNode(session.dialogueCode, nodeId);
        if (!node) {
            sessions.delete(client.auth.playerId);
            return DialogueErrorCode.DIALOGUE_NOT_FOUND;
        }
        session.nodeId = nodeId;
        const error = await this.runActions(room, client, player, session, node.actions);
        if (error) {
            sessions.delete(client.auth.playerId);
            return error;
        }
        if (!sessions.has(client.auth.playerId)) return undefined;
        this.send(room, client, player, session, node);
        return undefined;
    }

    private send(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        session: DialogueSession,
        node: DialogueNode
    ) {
        const ctx = player.conditionContext(room.map.code);
        const options = (node.options ?? []).flatMap((option) => {
            const enabled = conditionService.evaluateConditions(ctx, option.conditions);
            if (!enabled && option.hideIfFail) return [];
            return [
                {
                    id: option.id,
                    textKey: dialogueGraphService.optionTextKey(
                        session.dialogueCode,
                        node.id,
                        option
                    ),
                    enabled,
                },
            ];
        });
        const message: DialogueMessage = {
            sourceCode: session.sourceCode,
            dialogueCode: session.dialogueCode,
            nodeId: node.id,
            textKey: dialogueGraphService.nodeTextKey(session.dialogueCode, node),
            ...(node.speakerKey ? { speakerKey: node.speakerKey } : {}),
            options,
            hasNext: options.length === 0 && !!node.next,
            offerQuestCodes: (node.options ?? []).flatMap((option) =>
                (option.actions ?? []).flatMap((action) =>
                    action.type === "start_quest" ? [action.questCode] : []
                )
            ),
        };
        client.sendSuccess(WorldMessage.DIALOGUE, message);
    }

    end(room: WorldRoom, client: PlayerClient, sourceCode: string, error?: ErrorCode) {
        this.sessionsOf(room).delete(client.auth.playerId);
        if (error) client.sendError(WorldMessage.DIALOGUE_END, error, { sourceCode });
        else
            client.sendSuccess(WorldMessage.DIALOGUE_END, {
                sourceCode,
            } satisfies DialogueEndMessage);
    }

    /** Chạy lần lượt; action lỗi thì dừng và trả lỗi (các action trước đó giữ nguyên hiệu lực). */
    async runActions(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        session: DialogueSession,
        actions: readonly Action[] | undefined
    ): Promise<ErrorCode | undefined> {
        for (const action of actions ?? []) {
            const error = await this.runAction(room, client, player, session, action);
            if (error) return error;
        }
        return undefined;
    }

    private async runAction(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        session: DialogueSession,
        action: Action
    ): Promise<ErrorCode | undefined> {
        switch (action.type) {
            case "start_quest":
                return questWorldService.start(room, client, player, action.questCode);
            case "complete_quest":
                // Chỉ trả được tại đúng NPC nhận trả quest.
                return await questWorldService.complete(
                    room,
                    client,
                    player,
                    action.questCode,
                    session.npcCode ?? ""
                );
            case "give_item": {
                const item = itemService.getByCode(action.itemCode);
                if (!item) return ItemErrorCode.ITEM_NOT_FOUND;
                const items = [{ itemId: item.id, quantity: action.quantity }];
                const given = playerDataWorldService.apply(player, [
                    { type: "giveItem", items, source: ItemSource.QUEST, requireFit: true },
                ]);
                return Response.isError(given) ? given.code : undefined;
            }
            case "take_item": {
                const taken = playerDataWorldService.apply(player, [
                    { type: "takeItem", itemCode: action.itemCode, quantity: action.quantity },
                ]);
                return Response.isError(taken) ? taken.code : undefined;
            }
            case "give_currency":
                rewardWorldService.grant(room, client.auth.playerId, player, {
                    exp: 0,
                    currency: [{ code: action.currency, amount: action.amount }],
                    items: [],
                    source: ItemSource.QUEST,
                });
                return undefined;
            case "take_currency": {
                if (!player.debitCurrency([{ code: action.currency, amount: action.amount }])) {
                    return ItemErrorCode.CURRENCY_NOT_ENOUGH;
                }
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
                if (!fn || !session.npcCode) return NpcErrorCode.NPC_FUNCTION_NOT_FOUND;
                const message: NpcFunctionOpenMessage = {
                    npcCode: session.npcCode,
                    functionId: fn.id,
                    type: fn.type,
                    config: JSON.stringify(fn.config),
                };
                client.sendSuccess(WorldMessage.NPC_FUNCTION_OPEN, message);
                return undefined;
            }
            case "talk":
                if (session.npcCode) {
                    questWorldService.onEvent(room, client.auth.playerId, player, {
                        type: QuestObjectiveType.TALK,
                        targetCode: session.npcCode,
                    });
                }
                return undefined;
        }
    }
}

export const dialogueWorldService = new DialogueWorldService();
