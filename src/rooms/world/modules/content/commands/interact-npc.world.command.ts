import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import type { ErrorCode } from "@/core/types/result.type.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { NpcErrorCode } from "@/modules/npcs/enums/npc-error-code.enum.js";
import { DialogueErrorCode } from "@/modules/dialogues/enums/dialogue-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { sendFail } from "@/core/utils/room-send.util.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { selectDialogueCode } from "@/modules/dialogues/services/dialogue-rule.service.js";
import { dialogueService } from "@/modules/dialogues/services/dialogue.service.js";
import { npcService } from "@/modules/npcs/services/npc.service.js";
import { contentWorldService } from "@/rooms/world/modules/content/services/content.world.service.js";
import { dialogueWorldService } from "@/rooms/world/modules/content/services/dialogue.world.service.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import { InteractNpcSchema } from "@/rooms/world/modules/content/validators/content.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { WorldClientMessage, WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface ContentPayload {
    client: PlayerClient;
    payload: unknown;
}

/** Bắt đầu nói chuyện với NPC. */
@SdkMessage({
    replies: [WorldMessage.DIALOGUE, WorldMessage.DIALOGUE_END],
    errors: [
        CommonCode.INVALID_INPUT,
        PlayerErrorCode.PLAYER_DEAD,
        PlayerErrorCode.TOO_FAR,
        NpcErrorCode.NPC_NOT_FOUND,
        NpcErrorCode.NPC_NOT_IN_MAP,
        DialogueErrorCode.DIALOGUE_NOT_FOUND,
    ],
    note: "Thành công trả `dialogue`; thất bại trả `dialogueEnd` (lỗi có `error: { sourceCode }`).",
})
export class InteractNpcWorldCommand extends Command<WorldRoom, ContentPayload> {
    static readonly message = WorldClientMessage.INTERACT_NPC;

    execute({ client, payload }: ContentPayload) {
        const player = this.room.state.players.get(client.sessionId);
        if (!player) return;
        const parsed = InteractNpcSchema.safeParse(payload);
        const error = !parsed.success
            ? CommonCode.INVALID_INPUT
            : player.hp <= 0
              ? PlayerErrorCode.PLAYER_DEAD
              : this.startNpc(this.room, client, player, parsed.data.npcCode);
        if (error) {
            sendFail(client, WorldMessage.DIALOGUE_END, error, {
                sourceCode: parsed.success ? parsed.data.npcCode : "",
            });
        }
    }

    /** Nói chuyện với NPC: chọn thoại theo hoàn cảnh rồi vào node `start`. */
    private startNpc(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        npcCode: string
    ): ErrorCode | undefined {
        const npc = npcService.getByCode(npcCode);
        if (!npc) return NpcErrorCode.NPC_NOT_FOUND;
        // 1 NPC có thể đứng ở vài chỗ trong map — lấy chỗ gần player nhất.
        const placement = room.state.npcs
            .filter((n) => n.code === npcCode)
            .sort(
                (a, b) =>
                    Math.hypot(a.x - player.x, a.y - player.y) -
                    Math.hypot(b.x - player.x, b.y - player.y)
            )[0];
        if (!placement) return NpcErrorCode.NPC_NOT_IN_MAP;
        if (!contentWorldService.isNear(player, placement.x, placement.y, npc.interactRadius)) {
            return PlayerErrorCode.TOO_FAR;
        }
        const ctx = contentWorldService.conditionContext(room, player);
        const dialogueCode = selectDialogueCode(npc, ctx);
        if (!dialogueCode || !dialogueService.getByCode(dialogueCode))
            return DialogueErrorCode.DIALOGUE_NOT_FOUND;
        dialogueWorldService.begin(room, client, player, {
            sourceCode: npcCode,
            npcCode,
            dialogueCode,
            nodeId: "start",
            x: placement.x,
            y: placement.y,
            radius: npc.interactRadius,
        });
        questWorldService.sendMarkers(room, client, player);
        return undefined;
    }
}
