import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { Response } from "@/core/utils/response.util.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";
import type { PlayerDataState } from "@/rooms/global/modules/player-data/schemas/player-data.global.state.js";
import { playerDataGlobalService } from "@/rooms/global/modules/player-data/services/player-data.global.service.js";
import type { PlayerWorldView } from "@/rooms/global/modules/player-data/types/player-data.type.js";
import type { InventoryResult } from "@/rooms/global/modules/inventory/types/inventory.global.type.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import type { z } from "zod";

interface InventoryCommandPayload {
    client: PlayerClient;
    payload: unknown;
}

/**
 * Khung chung cho thao tác túi đồ / thuộc tính: validate payload, chạy thao tác trên bản làm việc của PlayerData rồi
 * để `PlayerDataGlobalService.mutate` lưu liền, đẩy sang world và gửi lại `inventory`. Lỗi thì response là `Result`
 * thất bại (không đẩy gì). Đổi đồ đang mặc / thuộc tính thì gửi thêm `attributes` (stats mới).
 */
@SdkMessage({
    replies: [GlobalMessage.INVENTORY],
    errors: [
        CommonCode.INVALID_INPUT,
        ItemErrorCode.ITEM_NOT_FOUND,
        ItemErrorCode.INVENTORY_FULL,
        ItemErrorCode.INVENTORY_SLOT_INVALID,
        ItemErrorCode.INVENTORY_SLOT_EMPTY,
    ],
    note: "Thành công: túi mới đến qua message `inventory` (không nằm trong response). Thất bại: không đẩy `inventory`.",
})
export abstract class InventoryGlobalCommand<
    TSchema extends z.ZodType,
    TValue,
> extends PlayerGlobalCommand<InventoryCommandPayload, TSchema> {
    protected abstract readonly validateSchema: TSchema;
    /** Có thể đổi stat (đồ đang mặc, cộng điểm) → gửi thêm `attributes`. */
    protected readonly changesStats: boolean = false;
    /** Gửi lại `inventory` sau khi thành công (thuộc tính thì không cần). */
    protected readonly sendsInventory: boolean = true;

    /** `world`: level / ví hiện tại lấy trực tiếp từ world; thao tác trả phí sửa `world.wallet` (global nhờ world trừ). */
    protected abstract run(
        player: PlayerDataState,
        payload: z.infer<TSchema>,
        world: PlayerWorldView
    ): InventoryResult<TValue>;

    /** Gửi thêm message riêng khi thành công (vd kết quả cường hoá). */
    protected onSuccess(_client: PlayerClient, _value: TValue): void {}

    /** `data` của response khi thành công; mặc định không có (client lấy túi mới từ message `inventory`). */
    protected toResponse(_value: TValue): unknown {
        return null;
    }

    async execute({ client }: InventoryCommandPayload) {
        const outcome = await playerDataGlobalService.mutate(
            this.room,
            client.auth.playerId,
            {
                changesStats: this.changesStats,
                sendsInventory: this.sendsInventory,
            },
            (work, world) => this.run(work, this.body, world)
        );
        if (Response.isError(outcome)) {
            this.result = outcome;
            return;
        }
        this.onSuccess(client, outcome.data as TValue);
        this.result = Response.success(this.toResponse(outcome.data as TValue));
    }
}
