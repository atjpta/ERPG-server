import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import { inventoryService } from "@/modules/player/services/inventory.service.js";
import { UpgradeGlobalCommand } from "@/rooms/global/modules/equipment-upgrade/commands/upgrade.global.command.js";
import { equipmentUpgradeService } from "@/modules/equipment/services/equipment-upgrade.service.js";
import { DisassembleItemsSchema } from "@/rooms/global/modules/inventory/validators/inventory.global.validator.js";
import type { PlayerDataState } from "@/rooms/global/modules/player-data/schemas/player-data.global.state.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { EquipmentUpgradeAction } from "@/rooms/global/modules/equipment-upgrade/enums/equipment-upgrade-action.enum.js";
import type { z } from "zod";

@SdkMessage({
    replies: [GlobalMessage.INVENTORY],
    errors: [
        CommonCode.INVALID_INPUT,
        ItemErrorCode.ITEM_NOT_FOUND,
        ItemErrorCode.INVENTORY_FULL,
        ItemErrorCode.INVENTORY_SLOT_INVALID,
        ItemErrorCode.INVENTORY_SLOT_EMPTY,
        ItemErrorCode.ITEM_LOCKED,
        ItemErrorCode.ITEM_NOT_EQUIPMENT,
    ],
})
export class DisassembleItemsGlobalCommand extends UpgradeGlobalCommand<
    typeof DisassembleItemsSchema
> {
    static readonly message = GlobalClientMessage.DISASSEMBLE_ITEMS;

    protected readonly validateSchema = DisassembleItemsSchema;
    protected run(
        player: PlayerDataState,
        { instanceIds }: z.infer<typeof DisassembleItemsSchema>
    ) {
        const result = equipmentUpgradeService.simulateDisassemble(player.inventories, instanceIds);
        if (Response.isError(result)) return result;
        const { ids, materials, received } = result.data;

        const bag = player.inventories[ItemType.EQUIPMENT];
        for (const id of ids) inventoryService.takeInstance(bag, id);
        player.inventories[ItemType.MATERIAL] = materials;
        return Response.success({
            action: EquipmentUpgradeAction.DISASSEMBLE,
            success: true,
            instanceIds: ids,
            materials: received,
        });
    }
}
