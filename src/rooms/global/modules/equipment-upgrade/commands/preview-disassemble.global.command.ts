import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { Response } from "@/core/utils/response.util.js";
import { equipmentUpgradeService } from "@/modules/equipment/services/equipment-upgrade.service.js";
import { DisassembleItemsSchema } from "@/rooms/global/modules/inventory/validators/inventory.global.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import type { DisassemblePreviewMessage } from "@/rooms/global/modules/equipment-upgrade/interfaces/equipment-upgrade.global.message.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

interface InventoryCommandPayload {
    client: PlayerClient;
    payload: unknown;
}

/** Tính thử phân rã (cho client hiện bảng xác nhận nguyên liệu nhận được) — không đổi state. */
@SdkMessage({
    response: "DisassemblePreviewMessage",
    errors: [
        CommonCode.INVALID_INPUT,
        ItemErrorCode.ITEM_NOT_FOUND,
        ItemErrorCode.ITEM_LOCKED,
        ItemErrorCode.ITEM_NOT_EQUIPMENT,
    ],
    note: "Lỗi có `error: { instanceIds }`.",
})
export class PreviewDisassembleGlobalCommand extends PlayerGlobalCommand<
    InventoryCommandPayload,
    typeof DisassembleItemsSchema
> {
    static readonly message = GlobalClientMessage.PREVIEW_DISASSEMBLE;

    protected override readonly validateSchema = DisassembleItemsSchema;

    execute(_payload: InventoryCommandPayload) {
        const { instanceIds } = this.body;
        const result = equipmentUpgradeService.simulateDisassemble(
            this.player.inventories,
            instanceIds
        );
        if (Response.isError(result)) {
            this.result = Response.error(result.code, undefined, { instanceIds });
            return;
        }
        this.result = Response.success<DisassemblePreviewMessage>({
            instanceIds: result.data.ids,
            materials: result.data.received,
        });
    }
}
