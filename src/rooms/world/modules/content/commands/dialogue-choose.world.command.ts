import { Response } from "@/core/response/response.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { WorldErrorCode } from "@/modules/world/enums/world-error-code.enum.js";
import { DialogueErrorCode } from "@/modules/dialogues/enums/dialogue-error-code.enum.js";
import type { ErrorCode } from "@/core/response/result.type.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { conditionService } from "@/modules/dialogues/services/condition.service.js";
import { dialogueService } from "@/modules/dialogues/services/dialogue.service.js";
import { dialogueWorldService } from "@/rooms/world/modules/content/services/dialogue.world.service.js";
import { DialogueChooseSchema } from "@/rooms/world/modules/content/validators/content.world.validator.js";
import type { PlayerWorldState } from "@/modules/player/state/player-world.state.js";
import { WorldClientMessage, WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { PlayerWorldCommand } from "@/rooms/world/player.world.command.js";

interface ContentPayload {
    client: PlayerClient;
    payload: unknown;
}

@SdkMessage({
    replies: [WorldMessage.DIALOGUE, WorldMessage.DIALOGUE_END],
    errors: [DialogueErrorCode.DIALOGUE_NOT_FOUND, WorldErrorCode.INTERACT_NOT_AVAILABLE],
    note: '`optionId` rỗng = "Tiếp tục". Node tiếp theo đến qua message `dialogue`; hết thoại thì `dialogueEnd`. Lỗi có `error: { sourceCode }` và phiên thoại đã đóng.',
})
export class DialogueChooseWorldCommand extends PlayerWorldCommand<
    ContentPayload,
    typeof DialogueChooseSchema
> {
    static readonly message = WorldClientMessage.DIALOGUE_CHOOSE;

    protected override readonly validateSchema = DialogueChooseSchema;

    async execute({ client }: ContentPayload) {
        this.result = await this.choose(this.room, client, this.player, this.body.optionId);
    }

    /** Chọn option (hoặc "Tiếp tục" khi `optionId` rỗng). */
    private async choose(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        optionId: string
    ): Promise<Response> {
        const session = room.dialogues.get(client.auth.playerId);
        if (!session) return Response.error(DialogueErrorCode.DIALOGUE_NOT_FOUND);
        const { sourceCode } = session;
        const refuse = (code: ErrorCode) => {
            room.dialogues.drop(client.auth.playerId);
            return Response.error(code, { sourceCode });
        };
        if (!session.isNear(player)) {
            dialogueWorldService.end(room, client, sourceCode); // quá xa thì đóng thoại, không báo lỗi
            return Response.success();
        }
        const node = dialogueService.getNode(session.dialogueCode, session.nodeId);
        if (!node) return refuse(DialogueErrorCode.DIALOGUE_NOT_FOUND);

        if (optionId === "") {
            if (node.options?.length || !node.next)
                dialogueWorldService.end(room, client, sourceCode);
            else {
                const entered = await dialogueWorldService.enter(
                    room,
                    client,
                    player,
                    session,
                    node.next
                );
                if (Response.isError(entered)) {
                    return Response.error(entered.errorCode, { sourceCode });
                }
            }
            return Response.success();
        }

        const option = node.options?.find((o) => o.id === optionId);
        const ctx = player.conditionContext(room.map.code);
        // Không tin client: option phải có thật và còn thoả điều kiện ở thời điểm chọn.
        if (!option || !conditionService.evaluateConditions(ctx, option.conditions)) {
            return refuse(WorldErrorCode.INTERACT_NOT_AVAILABLE);
        }
        const ran = await dialogueWorldService.runActions(
            room,
            client,
            player,
            session,
            option.actions
        );
        if (Response.isError(ran)) return refuse(ran.errorCode);
        // Action `teleport` có thể đã đóng thoại.
        if (!room.dialogues.has(client.auth.playerId)) return Response.success();
        if (option.next) {
            const entered = await dialogueWorldService.enter(
                room,
                client,
                player,
                session,
                option.next
            );
            if (Response.isError(entered)) {
                return Response.error(entered.errorCode, { sourceCode });
            }
        } else dialogueWorldService.end(room, client, sourceCode);
        return Response.success();
    }
}
