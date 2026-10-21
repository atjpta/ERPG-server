import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { UpdateAttributesSchema } from "@/rooms/world/modules/players/validators/update-attributes.world.validator.js";
import { WorldClientMessage, WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { PlayerWorldCommand } from "@/rooms/world/commands/player.world.command.js";

interface UpdateAttributesPayload {
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
export class PreviewAttributesWorldCommand extends PlayerWorldCommand<
    UpdateAttributesPayload,
    typeof UpdateAttributesSchema
> {
    static readonly message = WorldClientMessage.PREVIEW_ATTRIBUTES;

    protected override readonly validateSchema = UpdateAttributesSchema;
    protected override readonly replyType = WorldMessage.ATTRIBUTES_PREVIEW;

    execute({ client }: UpdateAttributesPayload) {
        const preview = this.player.previewAttributes(this.body);
        if (typeof preview === "string") client.sendError(WorldMessage.ATTRIBUTES_PREVIEW, preview);
        else client.sendSuccess(WorldMessage.ATTRIBUTES_PREVIEW, preview);
    }
}
