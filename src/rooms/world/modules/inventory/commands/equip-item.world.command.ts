import { classService } from "@/modules/classes/services/class.service.js";
import { EQUIPMENT_SLOTS_BY_TYPE } from "@/modules/items/enums/item-equipment.enum.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import { takeInstance } from "@/modules/player/services/inventory.service.js";
import { InventoryWorldCommand } from "@/rooms/world/modules/inventory/commands/inventory.world.command.js";
import { done, fail } from "@/rooms/world/modules/inventory/services/inventory.world.service.js";
import {
    toInventoryEquipment,
    toOwnedEquipment,
} from "@/rooms/world/modules/inventory/utils/equipment-instance.world.util.js";
import { EquipItemSchema } from "@/rooms/world/modules/inventory/validators/inventory.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import type { z } from "zod";

export class EquipItemWorldCommand extends InventoryWorldCommand<
    typeof EquipItemSchema,
    undefined
> {
    static readonly message = WorldClientMessage.EQUIP_ITEM;

    protected readonly schema = EquipItemSchema;
    protected override readonly changesStats = true;
    protected run(
        player: PlayerWorldState,
        { instanceId, slot: requestedSlot }: z.infer<typeof EquipItemSchema>
    ) {
        const bag = player.inventories[ItemType.EQUIPMENT];
        const entry = bag.find((candidate) => candidate.id === instanceId);
        if (!entry) return fail("Item not found");
        const owned = toOwnedEquipment(entry);
        if (!owned) return fail("Item is not equipment");
        if (!classService.canUseClassItem(player.classId, owned.template.classCode)) {
            return fail("Your class cannot use this item");
        }
        if (owned.metadata.level > player.level) return fail("Level is too low");

        const slots = EQUIPMENT_SLOTS_BY_TYPE[owned.template.equipmentType];
        if (requestedSlot && !slots.includes(requestedSlot)) return fail("Invalid slot");
        const slot =
            requestedSlot ?? slots.find((candidate) => !player.equipments[candidate]) ?? slots[0];

        takeInstance(bag, instanceId);
        const previous = player.equipments[slot];
        player.equipments[slot] = {
            id: entry.id,
            itemId: entry.itemId,
            source: entry.source,
            isLocked: entry.isLocked,
            metadata: owned.metadata,
        };
        // Món đang mặc ở slot đó về đúng ô vừa trống.
        if (previous) bag.push(toInventoryEquipment(previous, entry.slotIndex));
        player.refreshStats();
        return done(undefined);
    }
}
