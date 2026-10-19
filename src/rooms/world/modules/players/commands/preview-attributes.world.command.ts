import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { sendFail, sendOk } from "@/core/utils/room-send.util.js";
import { AllocateAttributesSchema } from "@/rooms/world/modules/players/validators/allocate-attributes.world.validator.js";
import { WorldClientMessage, WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface AllocateAttributesPayload {
    client: PlayerClient;
    payload: unknown;
}

/** Tính thử kết quả cộng điểm (cho client hiện bảng xác nhận "100 → 110") — không đổi state. */
@SdkMessage({
    replies: [WorldMessage.ATTRIBUTES_PREVIEW],
    errors: [
        CommonCode.INVALID_INPUT,
        PlayerErrorCode.ATTRIBUTE_NO_POINTS,
        PlayerErrorCode.ATTRIBUTE_POINTS_NOT_ENOUGH,
    ],
})
export class PreviewAttributesWorldCommand extends Command<WorldRoom, AllocateAttributesPayload> {
    static readonly message = WorldClientMessage.PREVIEW_ATTRIBUTES;

    execute({ client, payload }: AllocateAttributesPayload) {
        const player = this.room.state.players.get(client.auth.playerId);
        if (!player) return;

        const parsed = AllocateAttributesSchema.safeParse(payload);
        const preview = parsed.success
            ? player.previewAttributes(parsed.data)
            : CommonCode.INVALID_INPUT;
        if (typeof preview === "string") sendFail(client, WorldMessage.ATTRIBUTES_PREVIEW, preview);
        else sendOk(client, WorldMessage.ATTRIBUTES_PREVIEW, preview);
    }
}
