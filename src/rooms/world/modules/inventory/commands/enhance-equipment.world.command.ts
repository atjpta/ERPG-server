import { equipmentConfigService } from "@/modules/equipment/services/equipment-config.service.js";
import {
    applyEnhance,
    enhanceCost,
} from "@/modules/equipment/services/equipment-upgrade.service.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { UpgradeWorldCommand } from "@/rooms/world/modules/inventory/commands/upgrade.world.command.js";
import {
    done,
    equipmentUpgradeWorldService,
    fail,
} from "@/rooms/world/modules/inventory/services/equipment-upgrade.world.service.js";
import { UpgradeEquipmentSchema } from "@/rooms/world/modules/inventory/validators/inventory.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import {
    EquipmentUpgradeAction,
    WorldClientMessage,
} from "@/rooms/world/types/world-message.type.js";
import type { z } from "zod";

export class EnhanceEquipmentWorldCommand extends UpgradeWorldCommand<
    typeof UpgradeEquipmentSchema
> {
    static readonly message = WorldClientMessage.ENHANCE_EQUIPMENT;

    protected readonly schema = UpgradeEquipmentSchema;
    protected override readonly changesStats = true;
    protected run(
        player: PlayerWorldState,
        { instanceId }: z.infer<typeof UpgradeEquipmentSchema>
    ) {
        const rng = Math.random;
        const owned = equipmentUpgradeWorldService.findOwned(player, instanceId);
        if (!owned) return fail("Equipment not found");
        const cost = enhanceCost(owned.metadata, owned.group, equipmentConfigService.enhance);
        if ("reason" in cost) return fail(cost.reason);
        const paid = equipmentUpgradeWorldService.pay(player, cost.value);
        if (!paid.ok) return paid;

        const success = equipmentUpgradeWorldService.rollSuccess(cost.value.rate, rng);
        equipmentUpgradeWorldService.update(
            player,
            owned,
            applyEnhance(owned.metadata, cost.value.step, success)
        );
        return done({
            action: EquipmentUpgradeAction.ENHANCE,
            success,
            instanceIds: [instanceId],
            instance: owned.entry.metadata as ItemEquipmentInstanceMetadata,
        });
    }
}
