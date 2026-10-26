import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import type { NpcFunctionType } from "@/modules/npcs/schemas/npc-function.schema.js";
import { npcFunctionGlobalService } from "@/rooms/global/modules/npc-function/services/npc-function.global.service.js";
import { InventoryGlobalCommand } from "@/rooms/global/modules/inventory/commands/inventory.global.command.js";
import type { EquipmentUpgradeMessage } from "@/rooms/global/modules/equipment-upgrade/interfaces/equipment-upgrade.global.message.js";
import { NpcErrorCode } from "@/modules/npcs/enums/npc-error-code.enum.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import type { z } from "zod";

@SdkMessage({
    response: "EquipmentUpgradeMessage",
    errors: [NpcErrorCode.NPC_FUNCTION_NOT_OPEN, PlayerErrorCode.TOO_FAR],
    note: "Response mang kết quả cường hoá / tinh hoá / phân rã (thành công hay thất bại theo tỉ lệ); chi tiết thay đổi của túi đến qua `inventoryChanged`.",
})
export abstract class UpgradeGlobalCommand<
    TSchema extends z.ZodType,
> extends InventoryGlobalCommand<TSchema, EquipmentUpgradeMessage> {
    /** Chức năng NPC mà lệnh này là việc của nó: chỉ chạy khi người chơi đã mở chức năng đó ở NPC và còn đứng gần. */
    protected abstract readonly functionType: NpcFunctionType;

    override async execute(payload: { client: PlayerClient; payload: unknown }) {
        const open = await npcFunctionGlobalService.require(this.player, this.functionType);
        if (Response.isError(open)) {
            this.result = open;
            return;
        }
        await super.execute(payload);
    }

    protected override toResponse(value: EquipmentUpgradeMessage) {
        return value;
    }
}
