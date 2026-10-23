import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { Response } from "@/core/response/response.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";
import type { PlayerState } from "@/modules/player/state/player.state.js";
import { TransactAbort } from "@/rooms/global/modules/player-data/managers/player-state.manager.js";
import type { PlayerWorldView } from "@/rooms/global/modules/player-data/types/player-data.type.js";
import type { InventoryResult } from "@/rooms/global/modules/inventory/types/inventory.global.type.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import type { z } from "zod";

interface InventoryCommandPayload {
    client: PlayerClient;
    payload: unknown;
}

/**
 * Khung chung cho thao tác túi đồ / thuộc tính: validate payload, chạy thao tác trên bản nháp của dữ liệu người chơi
 * rồi lưu liền trong một transaction (`PlayerStateManager.transact`; lỗi nghiệp vụ thì bỏ bản nháp). Chi tiết thay đổi của túi (`inventoryChanged`) và stats mới (`attributes`) đến qua push
 * khi runtime báo túi đổi. Lỗi thì response là `Result` thất bại (không đẩy gì).
 */
@SdkMessage({
    replies: [GlobalMessage.INVENTORY_CHANGED],
    errors: [
        CommonCode.INVALID_INPUT,
        ItemErrorCode.ITEM_NOT_FOUND,
        ItemErrorCode.INVENTORY_FULL,
        ItemErrorCode.INVENTORY_SLOT_INVALID,
        ItemErrorCode.INVENTORY_SLOT_EMPTY,
    ],
    note: "Thành công: chi tiết thay đổi của túi đến qua message `inventoryChanged` (không nằm trong response). Thất bại: không đẩy gì.",
})
export abstract class InventoryGlobalCommand<
    TSchema extends z.ZodType,
    TValue,
> extends PlayerGlobalCommand<InventoryCommandPayload, TSchema> {
    protected abstract readonly validateSchema: TSchema;
    /** `world`: level / ví trong bản nháp; thao tác trả phí sửa `world.wallet`. */
    protected abstract run(
        player: PlayerState,
        payload: z.infer<TSchema>,
        world: PlayerWorldView
    ): InventoryResult<TValue>;

    /** Gửi thêm message riêng khi thành công (vd kết quả cường hoá). */
    protected onSuccess(_client: PlayerClient, _value: TValue): void {}

    /** `data` của response khi thành công; mặc định không có (client áp dụng message `inventoryChanged`). */
    protected toResponse(_value: TValue): unknown {
        return null;
    }

    async execute({ client }: InventoryCommandPayload) {
        const { player } = this;
        const outcome = await player.owner.transact(
            player.playerId,
            async (draft, _tx, playerState) => {
                const result = this.run(playerState.fork(draft), this.body, draft);
                if (Response.isError(result)) throw new TransactAbort(result);
                return result;
            }
        );
        if (Response.isError(outcome)) {
            this.result = outcome;
            return;
        }
        this.onSuccess(client, outcome.data as TValue);
        this.result = Response.success(this.toResponse(outcome.data as TValue));
    }
}
