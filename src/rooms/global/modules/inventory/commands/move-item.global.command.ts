import { InventoryGlobalCommand } from "@/rooms/global/modules/inventory/commands/inventory.global.command.js";
import { MoveItemSchema } from "@/rooms/global/modules/inventory/validators/inventory.global.validator.js";
import type { PlayerState } from "@/modules/player/state/player.state.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import type { z } from "zod";

export class MoveItemGlobalCommand extends InventoryGlobalCommand<
    typeof MoveItemSchema,
    undefined
> {
    static readonly message = GlobalClientMessage.MOVE_ITEM;

    protected readonly validateSchema = MoveItemSchema;
    protected run(player: PlayerState, { type, fromSlot, toSlot }: z.infer<typeof MoveItemSchema>) {
        return player.bag.moveSlot(type, fromSlot, toSlot);
    }
}
