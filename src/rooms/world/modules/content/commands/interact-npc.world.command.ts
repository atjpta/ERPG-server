import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { NpcErrorCode } from "@/modules/npcs/enums/npc-error-code.enum.js";
import { NpcKind } from "@/modules/npcs/enums/npc-kind.enum.js";
import { DialogueErrorCode } from "@/modules/dialogues/enums/dialogue-error-code.enum.js";
import { WorldErrorCode } from "@/modules/world/enums/world-error-code.enum.js";
import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { conditionService } from "@/modules/dialogues/services/condition.service.js";
import { dialogueRuleService } from "@/modules/dialogues/services/dialogue-rule.service.js";
import { dialogueService } from "@/modules/dialogues/services/dialogue.service.js";
import type { MapNpc } from "@/modules/maps/types/game-map.type.js";
import { npcService } from "@/modules/npcs/services/npc.service.js";
import { QuestObjectiveType } from "@/modules/quests/enums/quest.enum.js";
import { dialogueWorldService } from "@/rooms/world/modules/content/services/dialogue.world.service.js";
import { npcFunctionWorldService } from "@/rooms/world/modules/content/services/npc-function.world.service.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import { InteractNpcSchema } from "@/rooms/world/modules/content/validators/content.world.validator.js";
import type { InteractResultMessage } from "@/rooms/world/modules/content/interfaces/content.world.message.js";
import type { PlayerWorldState } from "@/modules/player/state/player-world.state.js";
import { WorldClientMessage, WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { PlayerWorldCommand } from "@/rooms/world/player.world.command.js";

interface ContentPayload {
    client: PlayerClient;
    payload: unknown;
}

/**
 * Tương tác với NPC hoặc vật thể (cổng, bệ teleport, bảng thông báo, điểm thu thập) theo id slot trong map. Cùng một luồng cho mọi thứ
 * đặt trong map: kiểm sống / đang bật / tầm đứng / điều kiện, rồi vật thể `autoOpen` chạy luôn chức năng đầu tiên, còn lại chọn thoại theo hoàn cảnh.
 */
@SdkMessage({
    response: "InteractResultMessage",
    replies: [
        WorldMessage.DIALOGUE,
        WorldMessage.NPC_FUNCTION_OPEN,
        WorldMessage.MAP_CHANGE,
        WorldMessage.TELEPORT_LIST,
        WorldMessage.REWARD,
    ],
    errors: [
        CommonCode.INVALID_INPUT,
        PlayerErrorCode.PLAYER_DEAD,
        PlayerErrorCode.TOO_FAR,
        PlayerErrorCode.REQUIREMENTS_NOT_MET,
        PlayerErrorCode.LEVEL_TOO_LOW,
        ItemErrorCode.INVENTORY_FULL,
        WorldErrorCode.INTERACT_NOT_AVAILABLE,
        NpcErrorCode.NPC_NOT_FOUND,
        NpcErrorCode.NPC_NOT_IN_MAP,
        NpcErrorCode.NPC_FUNCTION_NOT_FOUND,
        DialogueErrorCode.DIALOGUE_NOT_FOUND,
        MapErrorCode.MAP_NOT_FOUND,
        MapErrorCode.MAP_NOT_OPEN,
        MapErrorCode.MAP_ALREADY_CHANGING,
        MapErrorCode.MAP_SPAWN_NOT_FOUND,
    ],
    note: "Thành công kèm message hiệu ứng tuỳ chức năng (`dialogue`, `npcFunctionOpen`, `mapChange`, `teleportList`, `reward`). Lỗi có `error: { id }`.",
})
export class InteractNpcWorldCommand extends PlayerWorldCommand<
    ContentPayload,
    typeof InteractNpcSchema
> {
    static readonly message = WorldClientMessage.INTERACT_NPC;

    protected override readonly validateSchema = InteractNpcSchema;

    async execute({ client }: ContentPayload) {
        const { id } = this.body;
        const started = await this.interact(this.room, client, this.player, id);
        this.result = Response.isError(started)
            ? Response.error(started.errorCode, { id })
            : Response.success<InteractResultMessage>({ id });
    }

    private async interact(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        id: string
    ): Promise<Response> {
        if (player.hp <= 0) return Response.error(PlayerErrorCode.PLAYER_DEAD);
        const slot = room.map.npcs.find((npc) => npc.id === id);
        const state = room.state.npcs.find((npc) => npc.id === id);
        if (!slot || !state) return Response.error(NpcErrorCode.NPC_NOT_IN_MAP);
        const npc = npcService.getByCode(slot.npcCode);
        if (!npc) return Response.error(NpcErrorCode.NPC_NOT_FOUND);
        if (!state.active) return Response.error(WorldErrorCode.INTERACT_NOT_AVAILABLE);
        const radius = npcService.radiusOf(slot);
        if (!player.isNear(slot.x, slot.y, radius)) return Response.error(PlayerErrorCode.TOO_FAR);
        const ctx = player.conditionContext(room.map.code);
        if (!conditionService.evaluateConditions(ctx, slot.conditions)) {
            return Response.error(PlayerErrorCode.REQUIREMENTS_NOT_MET);
        }

        // Vật thể bấm là chạy: chức năng đầu tiên của chỗ đặt (của slot, hoặc của NPC).
        if (npc.autoOpen) {
            const fn = npcService.functionsOf(slot)[0];
            if (!fn) return Response.error(NpcErrorCode.NPC_FUNCTION_NOT_FOUND);
            return npcFunctionWorldService.open(room, client, player, slot, fn);
        }

        // 1 NPC có thể đứng ở vài chỗ trong map: thoại và vị trí lấy theo đúng chỗ được bấm.
        const dialogueCode = dialogueRuleService.selectDialogueCode(npc, ctx);
        if (!dialogueCode || !dialogueService.getByCode(dialogueCode))
            return Response.error(DialogueErrorCode.DIALOGUE_NOT_FOUND);
        const begun = await dialogueWorldService.begin(room, client, player, {
            sourceCode: slot.npcCode,
            npcCode: slot.npcCode,
            slotId: slot.id,
            dialogueCode,
            nodeId: "start",
            x: slot.x,
            y: slot.y,
            radius,
        });
        if (Response.isError(begun)) return begun;
        // Vật thể có thoại (bảng thông báo) tính là "tương tác vật thể" cho quest `interact`.
        if (npc.kind === NpcKind.OBJECT) this.notifyInteract(room, client, player, slot);
        questWorldService.sendMarkers(room, client, player);
        return Response.success();
    }

    private notifyInteract(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        slot: MapNpc
    ) {
        questWorldService.onEvent(room, client.auth.playerId, player, {
            type: QuestObjectiveType.INTERACT,
            targetCode: slot.id,
        });
    }
}
