import { Response } from "@/core/utils/response.util.js";
import { inventoryService } from "@/modules/player/services/inventory.service.js";
import { InventoryGlobalCommand } from "@/rooms/global/modules/inventory/commands/inventory.global.command.js";
import { inventoryGlobalService } from "@/rooms/global/modules/inventory/services/inventory.global.service.js";
import { MoveItemSchema } from "@/rooms/global/modules/inventory/validators/inventory.global.validator.js";
import type { PlayerDataState } from "@/rooms/global/modules/player-data/schemas/player-data.global.state.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import type { z } from "zod";

export class MoveItemGlobalCommand extends InventoryGlobalCommand<
    typeof MoveItemSchema,
    undefined
> {
    static readonly message = GlobalClientMessage.MOVE_ITEM;

    protected readonly validateSchema = MoveItemSchema;
    protected run(
        player: PlayerDataState,
        { type, fromSlot, toSlot }: z.infer<typeof MoveItemSchema>
    ) {
        const error = inventoryService.moveInventorySlot(
            player.inventories[type],
            inventoryGlobalService.inventorySize(type),
            fromSlot,
            toSlot
        );
        return error ? Response.error(error) : Response.success(undefined);
    }
}
