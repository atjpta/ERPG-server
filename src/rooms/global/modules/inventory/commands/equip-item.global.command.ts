import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { Response } from "@/core/utils/response.util.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { EQUIPMENT_SLOTS_BY_TYPE } from "@/modules/items/enums/item-equipment.enum.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import { inventoryService } from "@/modules/player/services/inventory.service.js";
import { InventoryGlobalCommand } from "@/rooms/global/modules/inventory/commands/inventory.global.command.js";
import {} from "@/rooms/global/modules/inventory/services/inventory.global.service.js";
import { equipmentInstanceService } from "@/modules/equipment/services/equipment-instance.service.js";
import { EquipItemSchema } from "@/rooms/global/modules/inventory/validators/inventory.global.validator.js";
import type { PlayerWorldView } from "@/rooms/global/modules/player-data/types/player-data.type.js";
import type { PlayerRuntime } from "@/rooms/runtime/modules/player/runtime/player-runtime.js";
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
        player: PlayerRuntime,
        { instanceId, slot: requestedSlot }: z.infer<typeof EquipItemSchema>,
        world: PlayerWorldView
    ) {
        const bag = player.inventories[ItemType.EQUIPMENT];
        const entry = bag.find((candidate) => candidate.id === instanceId);
        if (!entry) return Response.error(ItemErrorCode.ITEM_NOT_FOUND);
        const owned = equipmentInstanceService.toOwnedEquipment(entry);
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

        inventoryService.takeInstance(bag, instanceId);
        const previous = player.data.equipments[slot];
        player.data.equipments[slot] = {
            id: entry.id,
            itemId: entry.itemId,
            source: entry.source,
            isLocked: entry.isLocked,
            metadata: owned.metadata,
        };
        // Món đang mặc ở slot đó về đúng ô vừa trống.
        if (previous)
            bag.push(equipmentInstanceService.toInventoryEquipment(previous, entry.slotIndex));
        player.refreshStats();
        return Response.success(undefined);
    }
}
