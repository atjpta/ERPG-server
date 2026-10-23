import type { Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import type { PlayerRuntime } from "@/rooms/runtime/modules/player/runtime/player-runtime.js";
import { PLAYER_GROUP_COLUMNS } from "@/rooms/runtime/modules/player/constants/player-runtime.constant.js";
import {
    PlayerDataGroup,
    PlayerRuntimeEvent,
} from "@/rooms/runtime/modules/player/enums/player-runtime.enum.js";
import {
    inventoryService,
    type GrantOutcome,
} from "@/modules/player/services/inventory.service.js";
import type { PlayerSavedState } from "@/modules/player/types/player-fields.type.js";
import type { PlayerChangeOp } from "@/rooms/world/modules/players/types/player-change.world.type.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";

/** Chạy `ops` trên `view`; lỗi nghiệp vụ trả về `Result` thất bại (view có thể đã đổi một phần — người gọi dùng bản thử). */
function runOps(
    view: PlayerRuntime,
    ops: readonly PlayerChangeOp[],
    grants: GrantOutcome[]
): Result {
    for (const op of ops) {
        if (op.type === "takeItem") {
            if (!inventoryService.takeByCode(view.inventories, op.itemCode, op.quantity)) {
                return Response.error(ItemErrorCode.ITEM_NOT_ENOUGH);
            }
        } else if (op.type === "giveItem") {
            if (op.requireFit && !inventoryService.canFit(view.inventories, op.items)) {
                return Response.error(ItemErrorCode.INVENTORY_FULL);
            }
            grants.push(inventoryService.grantItems(view.inventories, op.items, op.source));
        } else {
            view.addPoints(op.attributePoints, op.skillPoints);
        }
    }
    return Response.success();
}

/**
 * Cầu nối world → túi đồ trong `PlayerRuntime` (dùng chung với global): item rơi, vật phẩm của quest / thoại / bình thuốc,
 * điểm khi lên level. Đồng bộ và nguyên tử (kiểm tra cả lô rồi mới ghi), lưu sớm ≤ 500 ms; global tự gửi `inventoryChanged`
 * cho client khi runtime báo túi đổi.
 */
export class PlayerDataWorldService {
    apply(player: PlayerWorldState, ops: readonly PlayerChangeOp[]): Result {
        if (ops.length === 0) return Response.success();
        const { runtime } = player;
        // Lô có thể thất bại giữa chừng (thiếu item, hết chỗ) thì thử trước trên bản sao của túi.
        const mayFail = ops.some(
            (op) => op.type === "takeItem" || (op.type === "giveItem" && op.requireFit)
        );
        if (mayFail) {
            const trial = {} as Record<string, unknown>;
            for (const column of PLAYER_GROUP_COLUMNS[PlayerDataGroup.BAG]) {
                trial[column] = structuredClone(runtime.data[column]);
            }
            const checked = runOps(runtime.fork(trial as PlayerSavedState), ops, []);
            if (Response.isError(checked)) return checked;
        }

        const grants: GrantOutcome[] = [];
        runtime.owner.mutate(
            runtime,
            PlayerDataGroup.BAG,
            () => {
                grants.length = 0;
                runOps(runtime, ops, grants);
            },
            { critical: true }
        );
        for (const grant of grants) {
            runtime.owner.emit(PlayerRuntimeEvent.BAG_GRANTED, runtime, grant);
        }
        return Response.success();
    }
}

export const playerDataWorldService = new PlayerDataWorldService();
