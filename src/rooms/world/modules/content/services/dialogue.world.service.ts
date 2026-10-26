import type { ErrorCode } from "@/core/response/result.type.js";
import { RoomResponse } from "@/core/response/room-response.js";
import { NpcErrorCode } from "@/modules/npcs/enums/npc-error-code.enum.js";
import { Response } from "@/core/response/response.js";
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
import { transferWorldService } from "@/rooms/world/modules/maps/services/transfer.world.service.js";
import type { PlayerWorldState } from "@/modules/player/state/player-world.state.js";
import { rewardWorldService } from "@/rooms/world/modules/rewards/services/reward.world.service.js";
import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type {
    DialogueEndMessage,
    DialogueMessage,
    NpcFunctionOpenMessage,
} from "@/rooms/world/modules/content/interfaces/content.world.message.js";
import {
    type DialogueSessionProps,
    type DialogueSessionState,
} from "@/modules/dialogues/state/dialogue-session.state.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

export class DialogueWorldService {
    /** Biển báo / vật thể có thoại (không có NPC). */
    startSource(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        source: { id: string; x: number; y: number; radius: number; dialogueCode: string }
    ): Promise<Response> {
        if (!dialogueService.getByCode(source.dialogueCode))
            return Promise.resolve(Response.error(DialogueErrorCode.DIALOGUE_NOT_FOUND));
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
        if (room.dialogues.size === 0) return;
        for (const [playerId, session] of room.dialogues) {
            const player = room.state.players.get(playerId);
            const client = room.clientOf(playerId);
            if (!player || !client) continue;
            if (session.isNear(player)) continue;
            this.end(room, client, session.sourceCode);
        }
    }

    begin(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        props: DialogueSessionProps
    ): Promise<Response> {
        const session = room.dialogues.start(client.auth.playerId, props);
        return this.enter(room, client, player, session, session.nodeId);
    }

    /**
     * Vào node `nodeId` và đẩy `dialogue` cho client. Lỗi thì đóng phiên và trả `Response` thất bại để command báo lại
     * qua response của request (không đẩy `dialogueEnd`).
     */
    async enter(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        session: DialogueSessionState,
        nodeId: string
    ): Promise<Response> {
        const node = dialogueService.getNode(session.dialogueCode, nodeId);
        if (!node) {
            room.dialogues.drop(client.auth.playerId);
            return Response.error(DialogueErrorCode.DIALOGUE_NOT_FOUND);
        }
        session.goTo(nodeId);
        const result = await this.runActions(room, client, player, session, node.actions);
        if (Response.isError(result)) {
            room.dialogues.drop(client.auth.playerId);
            return result;
        }
        if (!room.dialogues.has(client.auth.playerId)) return Response.success();
        this.send(room, client, player, session, node);
        return Response.success();
    }

    private send(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        session: DialogueSessionState,
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
        RoomResponse.send(client, WorldMessage.DIALOGUE, message);
    }

    end(room: WorldRoom, client: PlayerClient, sourceCode: string, error?: ErrorCode) {
        room.dialogues.drop(client.auth.playerId);
        if (error) RoomResponse.sendError(client, WorldMessage.DIALOGUE_END, error, { sourceCode });
        else
            RoomResponse.send(client, WorldMessage.DIALOGUE_END, {
                sourceCode,
            } satisfies DialogueEndMessage);
    }

    /** Chạy lần lượt; action lỗi thì dừng và trả lỗi (các action trước đó giữ nguyên hiệu lực). */
    async runActions(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        session: DialogueSessionState,
        actions: readonly Action[] | undefined
    ): Promise<Response> {
        for (const action of actions ?? []) {
            const result = await this.runAction(room, client, player, session, action);
            if (Response.isError(result)) return result;
        }
        return Response.success();
    }

    private async runAction(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        session: DialogueSessionState,
        action: Action
    ): Promise<Response> {
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
                if (!item) return Response.error(ItemErrorCode.ITEM_NOT_FOUND);
                const items = [{ itemId: item.id, quantity: action.quantity }];
                return player.applyOps([
                    { type: "giveItem", items, source: ItemSource.QUEST, requireFit: true },
                ]);
            }
            case "take_item": {
                return player.applyOps([
                    { type: "takeItem", itemCode: action.itemCode, quantity: action.quantity },
                ]);
            }
            case "give_currency":
                rewardWorldService.grant(room, client.auth.playerId, player, {
                    exp: 0,
                    currency: [{ code: action.currency, amount: action.amount }],
                    items: [],
                    source: ItemSource.QUEST,
                });
                return Response.success();
            case "take_currency": {
                if (!player.debitCurrency([{ code: action.currency, amount: action.amount }])) {
                    return Response.error(ItemErrorCode.CURRENCY_NOT_ENOUGH);
                }
                return Response.success();
            }
            case "set_flag":
                player.playerState.setFlag(action.key, action.value);
                return Response.success();
            case "heal":
                player.restoreFull();
                return Response.success();
            case "teleport":
                // Chuyển xong thì thoại kết thúc; lỗi thì báo lại.
                void transferWorldService
                    .transfer(room, client, player, action.mapCode, action.spawnId)
                    .then((result) =>
                        this.end(
                            room,
                            client,
                            session.sourceCode,
                            Response.isError(result) ? result.errorCode : undefined
                        )
                    );
                return Response.success();
            case "open_function": {
                const fn = npcService
                    .getByCode(session.npcCode ?? "")
                    ?.functions.find((f) => f.id === action.function);
                if (!fn || !session.npcCode)
                    return Response.error(NpcErrorCode.NPC_FUNCTION_NOT_FOUND);
                room.npcFunctions.open(client.auth.playerId, {
                    npcCode: session.npcCode,
                    functionId: fn.id,
                    type: fn.type,
                    x: session.x,
                    y: session.y,
                    radius: session.radius,
                });
                const message: NpcFunctionOpenMessage = {
                    npcCode: session.npcCode,
                    functionId: fn.id,
                    type: fn.type,
                    config: JSON.stringify(fn.config),
                };
                RoomResponse.send(client, WorldMessage.NPC_FUNCTION_OPEN, message);
                return Response.success();
            }
            case "talk":
                if (session.npcCode) {
                    questWorldService.onEvent(room, client.auth.playerId, player, {
                        type: QuestObjectiveType.TALK,
                        targetCode: session.npcCode,
                    });
                }
                return Response.success();
        }
    }
}

export const dialogueWorldService = new DialogueWorldService();
