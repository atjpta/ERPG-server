import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { fail, ok } from "@/core/utils/result.util.js";
import { InventoryWorldCommand } from "@/rooms/world/modules/inventory/commands/inventory.world.command.js";
import {} from "@/rooms/world/modules/inventory/services/inventory.world.service.js";
import { LockItemSchema } from "@/rooms/world/modules/inventory/validators/inventory.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import type { z } from "zod";

export class LockItemWorldCommand extends InventoryWorldCommand<typeof LockItemSchema, undefined> {
    static readonly message = WorldClientMessage.LOCK_ITEM;

    protected readonly validateSchema = LockItemSchema;
    protected run(
        player: PlayerWorldState,
        { instanceId, locked }: z.infer<typeof LockItemSchema>
    ) {
        const entry =
            Object.values(player.inventories)
                .flat()
                .find((candidate) => candidate.id === instanceId) ??
            Object.values(player.equipments).find((candidate) => candidate?.id === instanceId);
        if (!entry) return fail(ItemErrorCode.ITEM_NOT_FOUND);
        entry.isLocked = locked;
        return ok(undefined);
    }
}
