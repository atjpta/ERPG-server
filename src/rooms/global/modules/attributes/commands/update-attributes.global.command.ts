import { Response } from "@/core/utils/response.util.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { InventoryGlobalCommand } from "@/rooms/global/modules/inventory/commands/inventory.global.command.js";
import type { AttributesMessage } from "@/rooms/global/modules/attributes/interfaces/attributes.global.message.js";
import type { PlayerDataState } from "@/rooms/global/modules/player-data/schemas/player-data.global.state.js";
import { UpdateAttributesSchema } from "@/rooms/global/modules/attributes/validators/update-attributes.global.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import type { z } from "zod";

/**
 * Player cộng điểm tiềm năng (`attributePoints`) vào attribute. Global lưu liền và đẩy sang world để tính lại
 * HP / attack...; kết quả (hoặc lỗi) trả qua response của request.
 */
@SdkMessage({
    response: "AttributesMessage",
    replies: [],
    errors: [
        CommonCode.INVALID_INPUT,
        PlayerErrorCode.PLAYER_DEAD,
        PlayerErrorCode.ATTRIBUTE_NO_POINTS,
        PlayerErrorCode.ATTRIBUTE_POINTS_NOT_ENOUGH,
    ],
})
export class UpdateAttributesGlobalCommand extends InventoryGlobalCommand<
    typeof UpdateAttributesSchema,
    AttributesMessage
> {
    static readonly message = GlobalClientMessage.UPDATE_ATTRIBUTES;

    protected readonly validateSchema = UpdateAttributesSchema;
    protected override readonly sendsInventory = false;

    protected run(player: PlayerDataState, request: z.infer<typeof UpdateAttributesSchema>) {
        const error = player.updateAttributes(request);
        return error ? Response.error(error) : Response.success(player.getAttributeSummary());
    }

    protected override toResponse(value: AttributesMessage) {
        return value;
    }
}
