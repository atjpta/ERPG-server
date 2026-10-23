import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import type { Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import type { PlayerRuntime } from "@/rooms/runtime/modules/player/runtime/player-runtime.js";
import { TransactAbort } from "@/rooms/runtime/modules/player/services/player-runtime.service.js";
import type { PlayerSavedState } from "@/modules/player/types/player-fields.type.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import type { AttributesMessage } from "@/rooms/global/modules/attributes/interfaces/attributes.global.message.js";
import { inventoryDeltaGlobalService } from "@/rooms/global/modules/inventory/services/inventory-delta.global.service.js";
import { inventoryGlobalService } from "@/rooms/global/modules/inventory/services/inventory.global.service.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";

/**
 * Thao tác của global trên dữ liệu người chơi (`PlayerRuntime`, dùng chung với world): `mutate` chạy một thao tác trên
 * bản nháp rồi lưu liền trong một transaction (lỗi nghiệp vụ thì bỏ bản nháp), còn gửi chi tiết thay đổi (`inventoryChanged`,
 * `attributes`) cho client là việc của `GlobalRoom` khi runtime báo túi đổi (dù thay đổi đến từ global hay từ world).
 */
export class PlayerDataGlobalService {
    /**
     * Chạy một thao tác thay đổi túi / trang bị / điểm / ví của `player` trên bản nháp: `Result` lỗi thì bỏ, thành công
     * thì lưu liền. `draft` là dữ liệu đầy đủ (level, ví...) — thao tác trả phí sửa `draft.wallet`.
     */
    mutate<T>(
        player: PlayerRuntime,
        run: (work: PlayerRuntime, draft: PlayerSavedState) => Result<T>
    ): Promise<Result<T>> {
        return player.owner.transact(player.playerId, async (draft, _tx, runtime) => {
            const result = run(runtime.fork(draft), draft);
            if (Response.isError(result)) throw new TransactAbort(result);
            return result;
        });
    }

    /** Chi tiết thay đổi của túi / attributes kể từ lần gửi trước: chỉ gửi phần đổi (`inventoryChanged`, `attributes` khi stats đổi). */
    sendChanges(room: GlobalRoom, runtime: PlayerRuntime): void {
        const client = room.clientOf(runtime.playerId);
        if (!client) return;
        // Attributes trước: `diff` cập nhật cả bản "đã gửi" của túi nên phải so attributes khi bản đó còn cũ.
        const attributesChanged = inventoryDeltaGlobalService.attributesChanged(runtime);
        const delta = inventoryDeltaGlobalService.diff(runtime);
        if (delta) client.sendSuccess(GlobalMessage.INVENTORY_CHANGED, delta);
        if (attributesChanged) {
            const message: AttributesMessage = runtime.getAttributeSummary();
            client.sendSuccess(GlobalMessage.ATTRIBUTES, message);
        }
    }

    /** Gửi toàn bộ túi + thuộc tính MỘT lần lúc vào room; các thay đổi sau đó đến qua `sendChanges`. */
    sendInitial(client: PlayerClient, runtime: PlayerRuntime): void {
        inventoryGlobalService.send(client, runtime);
        const message: AttributesMessage = runtime.getAttributeSummary();
        client.sendSuccess(GlobalMessage.ATTRIBUTES, message);
        inventoryDeltaGlobalService.reset(runtime);
    }
}

export const playerDataGlobalService = new PlayerDataGlobalService();
