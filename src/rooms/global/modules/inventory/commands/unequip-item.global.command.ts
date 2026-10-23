import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { Response } from "@/core/response/response.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import { InventoryGlobalCommand } from "@/rooms/global/modules/inventory/commands/inventory.global.command.js";
import { EquipmentInstanceState } from "@/modules/equipment/state/equipment-instance.state.js";
import { UnequipItemSchema } from "@/rooms/global/modules/inventory/validators/inventory.global.validator.js";
import type { PlayerState } from "@/modules/player/state/player.state.js";
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
    protected run(player: PlayerState, { slot }: z.infer<typeof UnequipItemSchema>) {
        const equipped = player.data.equipments[slot];
        if (!equipped) return Response.error(ItemErrorCode.INVENTORY_SLOT_EMPTY);
        const [slotIndex] = player.bag.freeSlots(ItemType.EQUIPMENT);
        if (slotIndex === undefined) return Response.error(ItemErrorCode.INVENTORY_FULL);
        player.bag
            .bag(ItemType.EQUIPMENT)
            .push(EquipmentInstanceState.toInventoryItem(equipped, slotIndex));
        player.data.equipments[slot] = null;
        player.refreshStats();
        return Response.success(undefined);
    }
}
