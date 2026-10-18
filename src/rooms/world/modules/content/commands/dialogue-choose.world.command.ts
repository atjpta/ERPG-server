import { WorldErrorCode } from "@/rooms/world/types/world-error-code.type.js";
import { DialogueErrorCode } from "@/modules/dialogues/enums/dialogue-error-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { evaluateConditions } from "@/modules/dialogues/services/condition.service.js";
import { dialogueService } from "@/modules/dialogues/services/dialogue.service.js";
import { contentWorldService } from "@/rooms/world/modules/content/services/content.world.service.js";
import {
    dialogueWorldService,
    RANGE_MARGIN,
} from "@/rooms/world/modules/content/services/dialogue.world.service.js";
import { DialogueChooseSchema } from "@/rooms/world/modules/content/validators/content.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface ContentPayload {
    client: PlayerClient;
    payload: unknown;
}

export class DialogueChooseWorldCommand extends Command<WorldRoom, ContentPayload> {
    static readonly message = WorldClientMessage.DIALOGUE_CHOOSE;

    execute({ client, payload }: ContentPayload) {
        const player = this.room.state.players.get(client.sessionId);
        if (!player) return;
        const parsed = DialogueChooseSchema.safeParse(payload);
        if (!parsed.success) return;
        this.choose(this.room, client, player, parsed.data.optionId);
    }

    /** Chọn option (hoặc "Tiếp tục" khi `optionId` rỗng). */
    private choose(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        optionId: string
    ) {
        const session = dialogueWorldService.sessionsOf(room).get(client.sessionId);
        if (!session) return;
        const range = session.radius + RANGE_MARGIN;
        if (!contentWorldService.isNear(player, session.x, session.y, range)) {
            dialogueWorldService.end(room, client, session.sourceCode); // quá xa thì đóng thoại, không báo lỗi
            return;
        }
        const node = dialogueService.getNode(session.dialogueCode, session.nodeId);
        if (!node) {
            dialogueWorldService.end(
                room,
                client,
                session.sourceCode,
                DialogueErrorCode.DIALOGUE_NOT_FOUND
            );
            return;
        }

        if (optionId === "") {
            if (node.options?.length || !node.next)
                dialogueWorldService.end(room, client, session.sourceCode);
            else dialogueWorldService.enter(room, client, player, session, node.next);
            return;
        }

        const option = node.options?.find((o) => o.id === optionId);
        const ctx = contentWorldService.conditionContext(room, player);
        // Không tin client: option phải có thật và còn thoả điều kiện ở thời điểm chọn.
        if (!option || !evaluateConditions(ctx, option.conditions)) {
            dialogueWorldService.end(
                room,
                client,
                session.sourceCode,
                WorldErrorCode.INTERACT_NOT_AVAILABLE
            );
            return;
        }
        const error = dialogueWorldService.runActions(
            room,
            client,
            player,
            session,
            option.actions
        );
        if (error) {
            dialogueWorldService.end(room, client, session.sourceCode, error);
            return;
        }
        // Action `teleport` có thể đã đóng thoại.
        if (!dialogueWorldService.sessionsOf(room).has(client.sessionId)) return;
        if (option.next) dialogueWorldService.enter(room, client, player, session, option.next);
        else dialogueWorldService.end(room, client, session.sourceCode);
    }
}
