import { isFail, ok } from "@/core/utils/result.util.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import { takeInstance } from "@/modules/player/services/inventory.service.js";
import { UpgradeWorldCommand } from "@/rooms/world/modules/inventory/commands/upgrade.world.command.js";
import { equipmentUpgradeWorldService } from "@/rooms/world/modules/inventory/services/equipment-upgrade.world.service.js";
import { DisassembleItemsSchema } from "@/rooms/world/modules/inventory/validators/inventory.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import {
    EquipmentUpgradeAction,
    WorldClientMessage,
} from "@/rooms/world/types/world-message.type.js";
import type { z } from "zod";

export class DisassembleItemsWorldCommand extends UpgradeWorldCommand<
    typeof DisassembleItemsSchema
> {
    static readonly message = WorldClientMessage.DISASSEMBLE_ITEMS;

    protected readonly schema = DisassembleItemsSchema;
    protected run(
        player: PlayerWorldState,
        { instanceIds }: z.infer<typeof DisassembleItemsSchema>
    ) {
        const result = equipmentUpgradeWorldService.simulateDisassemble(player, instanceIds);
        if (isFail(result)) return result;
        const { ids, materials, received } = result.data;

        const bag = player.inventories[ItemType.EQUIPMENT];
        for (const id of ids) takeInstance(bag, id);
        player.inventories[ItemType.MATERIAL] = materials;
        return ok({
            action: EquipmentUpgradeAction.DISASSEMBLE,
            success: true,
            instanceIds: ids,
            materials: received,
        });
    }
}
