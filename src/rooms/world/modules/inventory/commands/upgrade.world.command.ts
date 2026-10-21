import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { InventoryWorldCommand } from "@/rooms/world/modules/inventory/commands/inventory.world.command.js";
import {
    WorldMessage,
    type EquipmentUpgradeMessage,
} from "@/rooms/world/types/world-message.type.js";
import type { z } from "zod";

@SdkMessage({
    replies: [WorldMessage.EQUIPMENT_UPGRADE],
})
export abstract class UpgradeWorldCommand<TSchema extends z.ZodType> extends InventoryWorldCommand<
    TSchema,
    EquipmentUpgradeMessage
> {
    protected override readonly saveImmediately = true;

    protected override onSuccess(client: PlayerClient, value: EquipmentUpgradeMessage) {
        client.sendSuccess(WorldMessage.EQUIPMENT_UPGRADE, value);
    }
}
