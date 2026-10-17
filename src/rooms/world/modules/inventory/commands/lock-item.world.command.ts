import { InventoryWorldCommand } from "@/rooms/world/modules/inventory/commands/inventory.world.command.js";
import { done, fail } from "@/rooms/world/modules/inventory/services/inventory.world.service.js";
import { LockItemSchema } from "@/rooms/world/modules/inventory/validators/inventory.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import type { z } from "zod";

export class LockItemWorldCommand extends InventoryWorldCommand<typeof LockItemSchema, undefined> {
    static readonly message = WorldClientMessage.LOCK_ITEM;

    protected readonly schema = LockItemSchema;
    protected run(
        player: PlayerWorldState,
        { instanceId, locked }: z.infer<typeof LockItemSchema>
    ) {
        const entry =
            Object.values(player.inventories)
                .flat()
                .find((candidate) => candidate.id === instanceId) ??
            Object.values(player.equipments).find((candidate) => candidate?.id === instanceId);
        if (!entry) return fail("Item not found");
        entry.isLocked = locked;
        return done(undefined);
    }
}
