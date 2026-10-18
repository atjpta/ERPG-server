import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { fail, isFail, ok } from "@/core/utils/result.util.js";
import { equipmentConfigService } from "@/modules/equipment/services/equipment-config.service.js";
import { applyRefine, refineCost } from "@/modules/equipment/services/equipment-upgrade.service.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { UpgradeWorldCommand } from "@/rooms/world/modules/inventory/commands/upgrade.world.command.js";
import { equipmentUpgradeWorldService } from "@/rooms/world/modules/inventory/services/equipment-upgrade.world.service.js";
import { UpgradeEquipmentSchema } from "@/rooms/world/modules/inventory/validators/inventory.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import {
    EquipmentUpgradeAction,
    WorldClientMessage,
} from "@/rooms/world/types/world-message.type.js";
import type { z } from "zod";

@SdkMessage({
    replies: [WorldMessage.INVENTORY, WorldMessage.ATTRIBUTES],
    errors: [
        CommonCode.INVALID_INPUT,
        PlayerErrorCode.PLAYER_DEAD,
        ItemErrorCode.ITEM_NOT_FOUND,
        ItemErrorCode.INVENTORY_FULL,
        ItemErrorCode.INVENTORY_SLOT_INVALID,
        ItemErrorCode.INVENTORY_SLOT_EMPTY,
        ItemErrorCode.EQUIPMENT_NOT_FOUND,
        ItemErrorCode.EQUIPMENT_CONFIG_MISSING,
        ItemErrorCode.EQUIPMENT_MAX_ENHANCE,
        ItemErrorCode.EQUIPMENT_NEEDS_REFINE,
        ItemErrorCode.EQUIPMENT_MAX_RARITY,
        ItemErrorCode.ITEM_NOT_ENOUGH,
        ItemErrorCode.CURRENCY_NOT_ENOUGH,
    ],
    note: "Thành công trả `equipmentUpgrade`; mọi lỗi trả trên `inventory` (không phải `equipmentUpgrade`).",
})
export class RefineEquipmentWorldCommand extends UpgradeWorldCommand<
    typeof UpgradeEquipmentSchema
> {
    static readonly message = WorldClientMessage.REFINE_EQUIPMENT;

    protected readonly schema = UpgradeEquipmentSchema;
    protected override readonly changesStats = true;
    protected run(
        player: PlayerWorldState,
        { instanceId }: z.infer<typeof UpgradeEquipmentSchema>
    ) {
        const rng = Math.random;
        const owned = equipmentUpgradeWorldService.findOwned(player, instanceId);
        if (!owned) return fail(ItemErrorCode.EQUIPMENT_NOT_FOUND);
        const cost = refineCost(owned.metadata, equipmentConfigService.refine);
        if (isFail(cost)) return cost;
        const statEntry = equipmentConfigService.findStatEntry(
            owned.template.classCode,
            owned.template.equipmentType,
            owned.metadata.level
        );
        if (!statEntry) return fail(ItemErrorCode.EQUIPMENT_CONFIG_MISSING);
        const paid = equipmentUpgradeWorldService.pay(player, cost.data);
        if (isFail(paid)) return paid;

        const success = equipmentUpgradeWorldService.rollSuccess(cost.data.rate, rng);
        if (success) {
            equipmentUpgradeWorldService.update(
                player,
                owned,
                applyRefine({
                    instance: owned.metadata,
                    target: cost.data.target,
                    rarityLineCount: equipmentConfigService.stat.rarityLineCount,
                    rarityPool: statEntry.rarityPool,
                    rng,
                })
            );
        }
        return ok({
            action: EquipmentUpgradeAction.REFINE,
            success,
            instanceIds: [instanceId],
            instance: owned.entry.metadata as ItemEquipmentInstanceMetadata,
        });
    }
}
