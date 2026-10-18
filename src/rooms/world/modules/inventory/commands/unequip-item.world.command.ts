import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { fail, ok } from "@/core/utils/result.util.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import { freeSlotIndexes } from "@/modules/player/services/inventory.service.js";
import { InventoryWorldCommand } from "@/rooms/world/modules/inventory/commands/inventory.world.command.js";
import { inventoryWorldService } from "@/rooms/world/modules/inventory/services/inventory.world.service.js";
import { toInventoryEquipment } from "@/rooms/world/modules/inventory/utils/equipment-instance.world.util.js";
import { UnequipItemSchema } from "@/rooms/world/modules/inventory/validators/inventory.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import type { z } from "zod";

@SdkMessage({
    replies: [WorldMessage.ATTRIBUTES],
})
export class UnequipItemWorldCommand extends InventoryWorldCommand<
    typeof UnequipItemSchema,
    undefined
> {
    static readonly message = WorldClientMessage.UNEQUIP_ITEM;

    protected readonly schema = UnequipItemSchema;
    protected override readonly changesStats = true;
    protected run(player: PlayerWorldState, { slot }: z.infer<typeof UnequipItemSchema>) {
        const equipped = player.equipments[slot];
        if (!equipped) return fail(ItemErrorCode.INVENTORY_SLOT_EMPTY);
        const bag = player.inventories[ItemType.EQUIPMENT];
        const [slotIndex] = freeSlotIndexes(
            bag,
            inventoryWorldService.inventorySize(ItemType.EQUIPMENT)
        );
        if (slotIndex === undefined) return fail(ItemErrorCode.INVENTORY_FULL);
        bag.push(toInventoryEquipment(equipped, slotIndex));
        player.equipments[slot] = null;
        player.refreshStats();
        return ok(undefined);
    }
}
