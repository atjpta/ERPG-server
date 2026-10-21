import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { UpdateAttributesSchema } from "@/rooms/world/modules/players/validators/update-attributes.world.validator.js";
import { WorldClientMessage, WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { playerService } from "@/modules/player/services/player.service.js";
import { PlayerWorldCommand } from "@/rooms/world/commands/player.world.command.js";

interface UpdateAttributesPayload {
    client: PlayerClient;
    payload: unknown;
}

/**
 * Player cộng điểm tiềm năng (`attributePoints`) vào attribute. Chỉ đổi state trong room — checkpoint /
 * lúc rời room lưu DB; stat (HP, attack…) tính lại ngay. Kết quả (hoặc lỗi) gửi lại riêng cho client đó.
 */
@SdkMessage({
    replies: [WorldMessage.ATTRIBUTES],
    errors: [
        CommonCode.INVALID_INPUT,
        PlayerErrorCode.PLAYER_DEAD,
        PlayerErrorCode.ATTRIBUTE_NO_POINTS,
        PlayerErrorCode.ATTRIBUTE_POINTS_NOT_ENOUGH,
    ],
})
export class UpdateAttributesWorldCommand extends PlayerWorldCommand<
    UpdateAttributesPayload,
    typeof UpdateAttributesSchema
> {
    static readonly message = WorldClientMessage.UPDATE_ATTRIBUTES;
    protected override readonly validateSchema = UpdateAttributesSchema;
    protected override readonly replyType = WorldMessage.ATTRIBUTES;

    validate({ client }: UpdateAttributesPayload) {
        const checked = playerService.updateAttributePoints(
            this.player.allocatedAttributes,
            this.player.attributePoints,
            this.body
        );
        if (typeof checked !== "string") return true;
        client.sendError(WorldMessage.ATTRIBUTES, checked);
        return false;
    }

    execute({ client }: UpdateAttributesPayload) {
        this.player.updateAttributes(this.body);
        client.sendSuccess(WorldMessage.ATTRIBUTES, this.player.getAttributeSummary());
    }
}
