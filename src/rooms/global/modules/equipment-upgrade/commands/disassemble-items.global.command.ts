import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { NpcFunctionType } from "@/modules/npcs/schemas/npc-function.schema.js";
import { NpcErrorCode } from "@/modules/npcs/enums/npc-error-code.enum.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import { UpgradeGlobalCommand } from "@/rooms/global/modules/equipment-upgrade/commands/upgrade.global.command.js";
import { equipmentUpgradeService } from "@/modules/equipment/services/equipment-upgrade.service.js";
import { DisassembleItemsSchema } from "@/rooms/global/modules/inventory/validators/inventory.global.validator.js";
import type { PlayerState } from "@/modules/player/state/player.state.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { EquipmentUpgradeAction } from "@/rooms/global/modules/equipment-upgrade/enums/equipment-upgrade-action.enum.js";
import type { z } from "zod";

@SdkMessage({
    replies: [GlobalMessage.INVENTORY_CHANGED],
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

    protected readonly functionType = NpcFunctionType.DISASSEMBLE;
    protected readonly validateSchema = DisassembleItemsSchema;
    protected run(player: PlayerState, { instanceIds }: z.infer<typeof DisassembleItemsSchema>) {
        const result = equipmentUpgradeService.simulateDisassemble(player.inventories, instanceIds);
        if (Response.isError(result)) return result;
        const { ids, materials, received } = result.data;

        for (const id of ids) player.bag.takeInstance(ItemType.EQUIPMENT, id);
        player.inventories[ItemType.MATERIAL] = materials;
        return Response.success({
            action: EquipmentUpgradeAction.DISASSEMBLE,
            success: true,
            instanceIds: ids,
            materials: received,
        });
    }
}
