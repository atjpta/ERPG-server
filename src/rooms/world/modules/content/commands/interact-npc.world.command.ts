import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import type { ErrorCode } from "@/core/types/result.type.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { NpcErrorCode } from "@/modules/npcs/enums/npc-error-code.enum.js";
import { DialogueErrorCode } from "@/modules/dialogues/enums/dialogue-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { dialogueRuleService } from "@/modules/dialogues/services/dialogue-rule.service.js";
import { dialogueService } from "@/modules/dialogues/services/dialogue.service.js";
import { npcService } from "@/modules/npcs/services/npc.service.js";
import { dialogueWorldService } from "@/rooms/world/modules/content/services/dialogue.world.service.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import { InteractNpcSchema } from "@/rooms/world/modules/content/validators/content.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { WorldClientMessage, WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { PlayerWorldCommand } from "@/rooms/world/player.world.command.js";

interface ContentPayload {
    client: PlayerClient;
    payload: unknown;
}

/** Bắt đầu nói chuyện với NPC. */
@SdkMessage({
    replies: [WorldMessage.DIALOGUE],
    errors: [
        CommonCode.INVALID_INPUT,
        PlayerErrorCode.PLAYER_DEAD,
        PlayerErrorCode.TOO_FAR,
        NpcErrorCode.NPC_NOT_FOUND,
        NpcErrorCode.NPC_NOT_IN_MAP,
        DialogueErrorCode.DIALOGUE_NOT_FOUND,
    ],
    note: "Thành công: node đầu tiên đến qua message `dialogue` (các node sau do `dialogueChoose`); response rỗng chỉ báo đã mở được. Thất bại: `error: { sourceCode }`.",
})
export class InteractNpcWorldCommand extends PlayerWorldCommand<
    ContentPayload,
    typeof InteractNpcSchema
> {
    static readonly message = WorldClientMessage.INTERACT_NPC;

    protected override readonly validateSchema = InteractNpcSchema;

    async execute({ client }: ContentPayload) {
        const error = await this.startNpc(this.room, client, this.player, this.body.npcCode);
        this.result = error
            ? Response.error(error, undefined, { sourceCode: this.body.npcCode })
            : Response.success();
    }

    /** Nói chuyện với NPC: chọn thoại theo hoàn cảnh rồi vào node `start`. */
    private async startNpc(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        npcCode: string
    ): Promise<ErrorCode | undefined> {
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
        if (!player.isNear(placement.x, placement.y, npc.interactRadius)) {
            return PlayerErrorCode.TOO_FAR;
        }
        const ctx = player.conditionContext(room.map.code);
        const dialogueCode = dialogueRuleService.selectDialogueCode(npc, ctx);
        if (!dialogueCode || !dialogueService.getByCode(dialogueCode))
            return DialogueErrorCode.DIALOGUE_NOT_FOUND;
        const error = await dialogueWorldService.begin(room, client, player, {
            sourceCode: npcCode,
            npcCode,
            dialogueCode,
            nodeId: "start",
            x: placement.x,
            y: placement.y,
            radius: npc.interactRadius,
        });
        if (error) return error;
        questWorldService.sendMarkers(room, client, player);
        return undefined;
    }
}
