import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { Response } from "@/core/utils/response.util.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { playerDataGlobalService } from "@/rooms/global/modules/player-data/services/player-data.global.service.js";
import { UpdateAttributesSchema } from "@/rooms/global/modules/attributes/validators/update-attributes.global.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

interface PreviewAttributesPayload {
    client: PlayerClient;
    payload: unknown;
}

/** Tính thử kết quả cộng điểm (cho client hiện bảng xác nhận "100 → 110") — không đổi state. */
@SdkMessage({
    response: "AttributesMessage",
    errors: [
        CommonCode.INVALID_INPUT,
        PlayerErrorCode.ATTRIBUTE_NO_POINTS,
        PlayerErrorCode.ATTRIBUTE_POINTS_NOT_ENOUGH,
    ],
})
export class PreviewAttributesGlobalCommand extends PlayerGlobalCommand<
    PreviewAttributesPayload,
    typeof UpdateAttributesSchema
> {
    static readonly message = GlobalClientMessage.PREVIEW_ATTRIBUTES;

    protected override readonly validateSchema = UpdateAttributesSchema;

    async execute({ client }: PreviewAttributesPayload) {
        const preview = await playerDataGlobalService.read(
            this.room,
            client.auth.playerId,
            {},
            (state) => state.previewAttributes(this.body)
        );
        this.result =
            typeof preview === "string" ? Response.error(preview) : Response.success(preview);
    }
}
