import { Response } from "@/core/response/response.js";
import { InventoryGlobalCommand } from "@/rooms/global/modules/inventory/commands/inventory.global.command.js";
import { SortInventorySchema } from "@/rooms/global/modules/inventory/validators/inventory.global.validator.js";
import type { PlayerState } from "@/modules/player/state/player.state.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import type { z } from "zod";

export class SortInventoryGlobalCommand extends InventoryGlobalCommand<
    typeof SortInventorySchema,
    undefined
> {
    static readonly message = GlobalClientMessage.SORT_INVENTORY;

    protected readonly validateSchema = SortInventorySchema;
    protected run(player: PlayerState, { type }: z.infer<typeof SortInventorySchema>) {
        player.bag.sortBag(type);
        return Response.success(undefined);
    }
}
