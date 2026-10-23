import { Response } from "@/core/utils/response.util.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { WorldErrorCode } from "@/rooms/world/enums/world-error-code.enum.js";
import { DialogueErrorCode } from "@/modules/dialogues/enums/dialogue-error-code.enum.js";
import type { ErrorCode, Result } from "@/core/types/result.type.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { conditionService } from "@/modules/dialogues/services/condition.service.js";
import { dialogueService } from "@/modules/dialogues/services/dialogue.service.js";
import {
    dialogueWorldService,
    RANGE_MARGIN,
} from "@/rooms/world/modules/content/services/dialogue.world.service.js";
import { DialogueChooseSchema } from "@/rooms/world/modules/content/validators/content.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
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
    ): Promise<Result<unknown>> {
        const sessions = dialogueWorldService.sessionsOf(room);
        const session = sessions.get(client.auth.playerId);
        if (!session) return Response.error(DialogueErrorCode.DIALOGUE_NOT_FOUND);
        const { sourceCode } = session;
        const refuse = (code: ErrorCode) => {
            sessions.delete(client.auth.playerId);
            return Response.error(code, undefined, { sourceCode });
        };
        const range = session.radius + RANGE_MARGIN;
        if (!player.isNear(session.x, session.y, range)) {
            dialogueWorldService.end(room, client, sourceCode); // quá xa thì đóng thoại, không báo lỗi
            return Response.success();
        }
        const node = dialogueService.getNode(session.dialogueCode, session.nodeId);
        if (!node) return refuse(DialogueErrorCode.DIALOGUE_NOT_FOUND);

        if (optionId === "") {
            if (node.options?.length || !node.next)
                dialogueWorldService.end(room, client, sourceCode);
            else {
                const error = await dialogueWorldService.enter(
                    room,
                    client,
                    player,
                    session,
                    node.next
                );
                if (error) return Response.error(error, undefined, { sourceCode });
            }
            return Response.success();
        }

        const option = node.options?.find((o) => o.id === optionId);
        const ctx = player.conditionContext(room.map.code);
        // Không tin client: option phải có thật và còn thoả điều kiện ở thời điểm chọn.
        if (!option || !conditionService.evaluateConditions(ctx, option.conditions)) {
            return refuse(WorldErrorCode.INTERACT_NOT_AVAILABLE);
        }
        const error = await dialogueWorldService.runActions(
            room,
            client,
            player,
            session,
            option.actions
        );
        if (error) return refuse(error);
        // Action `teleport` có thể đã đóng thoại.
        if (!sessions.has(client.auth.playerId)) return Response.success();
        if (option.next) {
            const nextError = await dialogueWorldService.enter(
                room,
                client,
                player,
                session,
                option.next
            );
            if (nextError) return Response.error(nextError, undefined, { sourceCode });
        } else dialogueWorldService.end(room, client, sourceCode);
        return Response.success();
    }
}
