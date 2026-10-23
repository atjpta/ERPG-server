import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { InventoryGlobalCommand } from "@/rooms/global/modules/inventory/commands/inventory.global.command.js";
import type { EquipmentUpgradeMessage } from "@/rooms/global/modules/equipment-upgrade/interfaces/equipment-upgrade.global.message.js";
import type { z } from "zod";

@SdkMessage({
    response: "EquipmentUpgradeMessage",
    note: "Response mang kết quả cường hoá / tinh hoá / phân rã (thành công hay thất bại theo tỉ lệ); chi tiết thay đổi của túi đến qua `inventoryChanged`.",
})
export abstract class UpgradeGlobalCommand<
    TSchema extends z.ZodType,
> extends InventoryGlobalCommand<TSchema, EquipmentUpgradeMessage> {
    protected override toResponse(value: EquipmentUpgradeMessage) {
        return value;
    }
}
