import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import { inventoryDeltaGlobalService } from "@/rooms/global/modules/inventory/services/inventory-delta.global.service.js";
import { inventoryGlobalService } from "@/rooms/global/modules/inventory/services/inventory.global.service.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    response: "InventoryMessage",
    note: "Gọi lúc vào game; sau đó cập nhật theo push `inventoryChanged`.",
})
export class GetInventoryGlobalCommand extends PlayerGlobalCommand {
    static readonly message = GlobalClientMessage.GET_INVENTORY;

    /** Toàn bộ túi + đồ đang mặc; delta về sau tính từ snapshot này. */
    execute() {
        inventoryDeltaGlobalService.resetInventory(this.player);
        this.result = Response.success(inventoryGlobalService.toMessage(this.player));
    }
}
