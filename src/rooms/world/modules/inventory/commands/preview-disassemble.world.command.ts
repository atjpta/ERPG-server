import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { isFail } from "@/core/utils/result.util.js";
import { equipmentUpgradeWorldService } from "@/rooms/world/modules/inventory/services/equipment-upgrade.world.service.js";
import { DisassembleItemsSchema } from "@/rooms/world/modules/inventory/validators/inventory.world.validator.js";
import {
    WorldClientMessage,
    WorldMessage,
    type DisassemblePreviewMessage,
} from "@/rooms/world/types/world-message.type.js";
import { PlayerWorldCommand } from "@/rooms/world/commands/player.world.command.js";

interface InventoryCommandPayload {
    client: PlayerClient;
    payload: unknown;
}

/** Tính thử phân rã (cho client hiện bảng xác nhận nguyên liệu nhận được) — không đổi state. */
@SdkMessage({
    replies: [WorldMessage.DISASSEMBLE_PREVIEW],
    errors: [
        CommonCode.INVALID_INPUT,
        ItemErrorCode.ITEM_NOT_FOUND,
        ItemErrorCode.ITEM_LOCKED,
        ItemErrorCode.ITEM_NOT_EQUIPMENT,
    ],
    note: "Lỗi có `error: { instanceIds }`.",
})
export class PreviewDisassembleWorldCommand extends PlayerWorldCommand<
    InventoryCommandPayload,
    typeof DisassembleItemsSchema
> {
    static readonly message = WorldClientMessage.PREVIEW_DISASSEMBLE;

    protected override readonly validateSchema = DisassembleItemsSchema;
    protected override readonly replyType = WorldMessage.DISASSEMBLE_PREVIEW;

    execute({ client }: InventoryCommandPayload) {
        const { player } = this;
        const { instanceIds } = this.body;
        const result = equipmentUpgradeWorldService.simulateDisassemble(player, instanceIds);
        if (isFail(result)) {
            client.sendError(WorldMessage.DISASSEMBLE_PREVIEW, result.code, { instanceIds });
            return;
        }
        const message: DisassemblePreviewMessage = {
            instanceIds: result.data.ids,
            materials: result.data.received,
        };
        client.sendSuccess(WorldMessage.DISASSEMBLE_PREVIEW, message);
    }
}
