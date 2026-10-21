import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { inventoryWorldService } from "@/rooms/world/modules/inventory/services/inventory.world.service.js";
import type { InventoryResult } from "@/rooms/world/modules/inventory/types/inventory.world.type.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { isFail } from "@/core/utils/result.util.js";
import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import { PlayerWorldCommand } from "@/rooms/world/commands/player.world.command.js";
import type { z } from "zod";

interface InventoryCommandPayload {
    client: PlayerClient;
    payload: unknown;
}

/**
 * Khung chung cho thao tác túi đồ: validate payload, chặn khi đã chết, chạy thao tác rồi gửi lại
 * `inventory` (lỗi thì gửi `Result` thất bại trên cùng message). Đổi đồ đang mặc thì gửi thêm `attributes` (stat mới).
 */
@SdkMessage({
    replies: [WorldMessage.INVENTORY],
    errors: [
        CommonCode.INVALID_INPUT,
        ItemErrorCode.ITEM_NOT_FOUND,
        ItemErrorCode.INVENTORY_FULL,
        ItemErrorCode.INVENTORY_SLOT_INVALID,
        ItemErrorCode.INVENTORY_SLOT_EMPTY,
    ],
})
export abstract class InventoryWorldCommand<
    TSchema extends z.ZodType,
    TValue,
> extends PlayerWorldCommand<InventoryCommandPayload, TSchema> {
    protected abstract readonly validateSchema: TSchema;
    /** Thao tác có random kết quả → lưu DB ngay sau khi thành công. */
    protected readonly saveImmediately: boolean = false;
    /** Có thể đổi stat (đồ đang mặc) → gửi thêm `attributes`. */
    protected readonly changesStats: boolean = false;

    protected abstract run(
        player: PlayerWorldState,
        payload: z.infer<TSchema>
    ): InventoryResult<TValue>;

    /** Gửi thêm message riêng khi thành công (vd kết quả cường hoá). */
    protected onSuccess(_client: PlayerClient, _value: TValue): void {}

    protected override readonly replyType = WorldMessage.INVENTORY;

    async execute({ client }: InventoryCommandPayload) {
        const player = this.player;
        const result = this.run(player, this.body);

        if (isFail(result)) {
            client.sendResult(WorldMessage.INVENTORY, result);
            return;
        }
        this.onSuccess(client, result.data);
        inventoryWorldService.send(client, player);
        if (this.changesStats)
            client.sendSuccess(WorldMessage.ATTRIBUTES, player.getAttributeSummary());
        if (this.saveImmediately) await worldService.savePlayer(this.room, client.auth.playerId);
    }
}
