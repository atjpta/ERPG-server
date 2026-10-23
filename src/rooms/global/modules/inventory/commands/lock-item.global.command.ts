import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { Response } from "@/core/utils/response.util.js";
import { InventoryGlobalCommand } from "@/rooms/global/modules/inventory/commands/inventory.global.command.js";
import {} from "@/rooms/global/modules/inventory/services/inventory.global.service.js";
import { LockItemSchema } from "@/rooms/global/modules/inventory/validators/inventory.global.validator.js";
import type { PlayerDataState } from "@/rooms/global/modules/player-data/schemas/player-data.global.state.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import type { z } from "zod";

export class LockItemGlobalCommand extends InventoryGlobalCommand<
    typeof LockItemSchema,
    undefined
> {
    static readonly message = GlobalClientMessage.LOCK_ITEM;

    protected readonly validateSchema = LockItemSchema;
    protected run(player: PlayerDataState, { instanceId, locked }: z.infer<typeof LockItemSchema>) {
        const entry =
            Object.values(player.inventories)
                .flat()
                .find((candidate) => candidate.id === instanceId) ??
            Object.values(player.equipments).find((candidate) => candidate?.id === instanceId);
        if (!entry) return Response.error(ItemErrorCode.ITEM_NOT_FOUND);
        entry.isLocked = locked;
        return Response.success(undefined);
    }
}
