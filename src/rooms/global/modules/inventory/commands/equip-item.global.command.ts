import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { Response } from "@/core/response/response.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { EQUIPMENT_SLOTS_BY_TYPE } from "@/modules/items/enums/item-equipment.enum.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import { InventoryGlobalCommand } from "@/rooms/global/modules/inventory/commands/inventory.global.command.js";
import {} from "@/rooms/global/modules/inventory/services/inventory.global.service.js";
import { EquipmentInstanceState } from "@/modules/equipment/state/equipment-instance.state.js";
import { EquipItemSchema } from "@/rooms/global/modules/inventory/validators/inventory.global.validator.js";
import type { PlayerWorldView } from "@/rooms/global/modules/player-data/types/player-data.type.js";
import type { PlayerState } from "@/modules/player/state/player.state.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import type { z } from "zod";

@SdkMessage({
    replies: [GlobalMessage.ATTRIBUTES],
    errors: [
        ItemErrorCode.ITEM_NOT_EQUIPMENT,
        ItemErrorCode.ITEM_CLASS_MISMATCH,
        PlayerErrorCode.LEVEL_TOO_LOW,
    ],
})
export class EquipItemGlobalCommand extends InventoryGlobalCommand<
    typeof EquipItemSchema,
    undefined
> {
    static readonly message = GlobalClientMessage.EQUIP_ITEM;

    protected readonly validateSchema = EquipItemSchema;
    protected run(
        player: PlayerState,
        { instanceId, slot: requestedSlot }: z.infer<typeof EquipItemSchema>,
        world: PlayerWorldView
    ) {
        const bag = player.inventories[ItemType.EQUIPMENT];
        const entry = bag.find((candidate) => candidate.id === instanceId);
        if (!entry) return Response.error(ItemErrorCode.ITEM_NOT_FOUND);
        const owned = EquipmentInstanceState.from(entry);
        if (!owned) return Response.error(ItemErrorCode.ITEM_NOT_EQUIPMENT);
        if (!classService.canUseClassItem(player.classId, owned.template.classCode)) {
            return Response.error(ItemErrorCode.ITEM_CLASS_MISMATCH);
        }
        if (owned.metadata.level > world.level)
            return Response.error(PlayerErrorCode.LEVEL_TOO_LOW);

        const slots = EQUIPMENT_SLOTS_BY_TYPE[owned.template.equipmentType];
        if (requestedSlot && !slots.includes(requestedSlot))
            return Response.error(ItemErrorCode.INVENTORY_SLOT_INVALID);
        const slot =
            requestedSlot ??
            slots.find((candidate) => !player.data.equipments[candidate]) ??
            slots[0];

        player.bag.takeInstance(ItemType.EQUIPMENT, instanceId);
        const previous = player.data.equipments[slot];
        player.data.equipments[slot] = EquipmentInstanceState.toEquipped(entry);
        // Món đang mặc ở slot đó về đúng ô vừa trống.
        if (previous) bag.push(EquipmentInstanceState.toInventoryItem(previous, entry.slotIndex));
        player.refreshStats();
        return Response.success(undefined);
    }
}
