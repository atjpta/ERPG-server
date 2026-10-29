import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import { InventoryGlobalCommand } from "@/rooms/global/modules/inventory/commands/inventory.global.command.js";
import type { EquipmentUpgradeMessage } from "@/rooms/global/modules/equipment-upgrade/interfaces/equipment-upgrade.global.message.js";
import { equipmentUpgradeService } from "@/modules/equipment/services/equipment-upgrade.service.js";
import { DisassembleItemsSchema } from "@/rooms/global/modules/inventory/validators/inventory.global.validator.js";
import type { PlayerState } from "@/modules/player/state/player.state.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { EquipmentUpgradeAction } from "@/rooms/global/modules/equipment-upgrade/enums/equipment-upgrade-action.enum.js";
import type { z } from "zod";

/** Phân rã dùng được ở bất cứ đâu (không cần mở chức năng ở NPC). */
@SdkMessage({
    response: "EquipmentUpgradeMessage",
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
export class DisassembleItemsGlobalCommand extends InventoryGlobalCommand<
    typeof DisassembleItemsSchema,
    EquipmentUpgradeMessage
> {
    static readonly message = GlobalClientMessage.DISASSEMBLE_ITEMS;

    protected readonly validateSchema = DisassembleItemsSchema;
    protected run(player: PlayerState, { instanceIds }: z.infer<typeof DisassembleItemsSchema>) {
        const result = equipmentUpgradeService.simulateDisassemble(player.inventories, instanceIds);
        if (Response.isError(result)) return result;
        const { ids, materials, received } = result.data;

        for (const id of ids) player.bag.takeInstance(ItemType.EQUIPMENT, id);
        // `inventories` is a view built on each call: assigning to it saves nothing, so the material bag is replaced in place.
        const materialBag = player.inventories[ItemType.MATERIAL];
        materialBag.splice(0, materialBag.length, ...materials);
        return Response.success({
            action: EquipmentUpgradeAction.DISASSEMBLE,
            success: true,
            instanceIds: ids,
            materials: received,
        });
    }

    protected override toResponse(value: EquipmentUpgradeMessage) {
        return value;
    }
}
