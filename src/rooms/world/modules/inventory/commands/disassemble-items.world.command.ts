import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
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

@SdkMessage({
    replies: [WorldMessage.INVENTORY],
    errors: [
        CommonCode.INVALID_INPUT,
        PlayerErrorCode.PLAYER_DEAD,
        ItemErrorCode.ITEM_NOT_FOUND,
        ItemErrorCode.INVENTORY_FULL,
        ItemErrorCode.INVENTORY_SLOT_INVALID,
        ItemErrorCode.INVENTORY_SLOT_EMPTY,
        ItemErrorCode.ITEM_LOCKED,
        ItemErrorCode.ITEM_NOT_EQUIPMENT,
    ],
    note: "Thành công trả `equipmentUpgrade`; mọi lỗi trả trên `inventory`.",
})
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
