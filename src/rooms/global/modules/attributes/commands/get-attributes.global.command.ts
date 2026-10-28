import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import type { AttributesMessage } from "@/rooms/global/modules/attributes/interfaces/attributes.global.message.js";
import { inventoryDeltaGlobalService } from "@/rooms/global/modules/inventory/services/inventory-delta.global.service.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    response: "AttributesMessage",
    note: "Gọi lúc vào game; sau đó cập nhật theo push `attributes`.",
})
export class GetAttributesGlobalCommand extends PlayerGlobalCommand {
    static readonly message = GlobalClientMessage.GET_ATTRIBUTES;

    /** Điểm còn lại, attribute và stat hiện tại; push `attributes` về sau chỉ gửi khi khác snapshot này. */
    execute() {
        inventoryDeltaGlobalService.resetAttributes(this.player);
        this.result = Response.success<AttributesMessage>(this.player.getAttributeSummary());
    }
}
