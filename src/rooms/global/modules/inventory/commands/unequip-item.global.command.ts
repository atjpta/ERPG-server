import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { Response } from "@/core/utils/response.util.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import { inventoryService } from "@/modules/player/services/inventory.service.js";
import { InventoryGlobalCommand } from "@/rooms/global/modules/inventory/commands/inventory.global.command.js";
import { inventoryGlobalService } from "@/rooms/global/modules/inventory/services/inventory.global.service.js";
import { equipmentInstanceService } from "@/modules/equipment/services/equipment-instance.service.js";
import { UnequipItemSchema } from "@/rooms/global/modules/inventory/validators/inventory.global.validator.js";
import type { PlayerRuntime } from "@/rooms/runtime/modules/player/runtime/player-runtime.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import type { z } from "zod";

@SdkMessage({
    replies: [GlobalMessage.ATTRIBUTES],
})
export class UnequipItemGlobalCommand extends InventoryGlobalCommand<
    typeof UnequipItemSchema,
    undefined
> {
    static readonly message = GlobalClientMessage.UNEQUIP_ITEM;

    protected readonly validateSchema = UnequipItemSchema;
    protected run(player: PlayerRuntime, { slot }: z.infer<typeof UnequipItemSchema>) {
        const equipped = player.data.equipments[slot];
        if (!equipped) return Response.error(ItemErrorCode.INVENTORY_SLOT_EMPTY);
        const bag = player.inventories[ItemType.EQUIPMENT];
        const [slotIndex] = inventoryService.freeSlotIndexes(
            bag,
            inventoryGlobalService.inventorySize(ItemType.EQUIPMENT)
        );
        if (slotIndex === undefined) return Response.error(ItemErrorCode.INVENTORY_FULL);
        bag.push(equipmentInstanceService.toInventoryEquipment(equipped, slotIndex));
        player.data.equipments[slot] = null;
        player.refreshStats();
        return Response.success(undefined);
    }
}
