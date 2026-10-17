import { moveInventorySlot } from "@/modules/player/services/inventory.service.js";
import { InventoryWorldCommand } from "@/rooms/world/modules/inventory/commands/inventory.world.command.js";
import {
    done,
    fail,
    inventoryWorldService,
} from "@/rooms/world/modules/inventory/services/inventory.world.service.js";
import { MoveItemSchema } from "@/rooms/world/modules/inventory/validators/inventory.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import type { z } from "zod";

export class MoveItemWorldCommand extends InventoryWorldCommand<typeof MoveItemSchema, undefined> {
    static readonly message = WorldClientMessage.MOVE_ITEM;

    protected readonly schema = MoveItemSchema;
    protected run(
        player: PlayerWorldState,
        { type, fromSlot, toSlot }: z.infer<typeof MoveItemSchema>
    ) {
        const error = moveInventorySlot(
            player.inventories[type],
            inventoryWorldService.inventorySize(type),
            fromSlot,
            toSlot
        );
        return error ? fail(error) : done(undefined);
    }
}
