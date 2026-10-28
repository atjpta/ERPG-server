import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { NpcFunctionType } from "@/modules/npcs/schemas/npc-function.schema.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { Response } from "@/core/response/response.js";
import { equipmentConfigService } from "@/modules/equipment/services/equipment-config.service.js";
import { equipmentUpgradeService } from "@/modules/equipment/services/equipment-upgrade.service.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { UpgradeGlobalCommand } from "@/rooms/global/modules/equipment-upgrade/commands/upgrade.global.command.js";
import { UpgradeEquipmentSchema } from "@/rooms/global/modules/inventory/validators/inventory.global.validator.js";
import type { PlayerWorldView } from "@/rooms/global/modules/player-data/types/player-data.type.js";
import type { PlayerState } from "@/modules/player/state/player.state.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { EquipmentUpgradeAction } from "@/rooms/global/modules/equipment-upgrade/enums/equipment-upgrade-action.enum.js";
import type { z } from "zod";

@SdkMessage({
    replies: [GlobalMessage.INVENTORY_CHANGED, GlobalMessage.ATTRIBUTES],
    errors: [
        CommonCode.INVALID_INPUT,
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
})
export class RefineEquipmentGlobalCommand extends UpgradeGlobalCommand<
    typeof UpgradeEquipmentSchema
> {
    static readonly message = GlobalClientMessage.REFINE_EQUIPMENT;

    protected readonly functionType = NpcFunctionType.REFINE;
    protected readonly validateSchema = UpgradeEquipmentSchema;
    protected run(
        player: PlayerState,
        { instanceId }: z.infer<typeof UpgradeEquipmentSchema>,
        world: PlayerWorldView
    ) {
        const rng = Math.random;
        const owned = player.findOwned(instanceId);
        if (!owned) return Response.error(ItemErrorCode.EQUIPMENT_NOT_FOUND);
        const cost = equipmentUpgradeService.refineCost(
            owned.metadata,
            masterDataCacheService.get(MasterDataKey.EQUIPMENT_REFINE_CONFIG)
        );
        if (Response.isError(cost)) return cost;
        const statEntry = equipmentConfigService.findStatEntry(
            owned.template.classCode,
            owned.template.equipmentType,
            owned.metadata.level
        );
        if (!statEntry) return Response.error(ItemErrorCode.EQUIPMENT_CONFIG_MISSING);
        const paid = equipmentUpgradeService.pay(player.bag, world.wallet, cost.data);
        if (Response.isError(paid)) return paid;
        world.wallet = paid.data.wallet;

        const success = equipmentUpgradeService.rollSuccess(cost.data.rate, rng);
        if (success) {
            owned.entry.metadata = equipmentUpgradeService.applyRefine({
                instance: owned.metadata,
                target: cost.data.target,
                rarityLineCount: masterDataCacheService.get(MasterDataKey.EQUIPMENT_STAT_CONFIG)
                    .rarityLineCount,
                rarityPool: statEntry.rarityPool,
                rng,
            });
            player.refreshStats();
        }
        return Response.success({
            action: EquipmentUpgradeAction.REFINE,
            success,
            instanceIds: [instanceId],
            instance: owned.entry.metadata as ItemEquipmentInstanceMetadata,
        });
    }
}
