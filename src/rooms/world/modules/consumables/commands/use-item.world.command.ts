import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { RoomResponse } from "@/core/response/room-response.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { Response } from "@/core/response/response.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import type { ConsumableMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { itemService } from "@/modules/items/services/item.service.js";
import type { ConsumableGain } from "@/modules/items/types/consumable-gain.type.js";
import { UseItemSchema } from "@/rooms/world/modules/consumables/validators/consumable.world.validator.js";
import { WorldClientMessage, WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type { PotionUsedMessage } from "@/rooms/world/modules/consumables/interfaces/consumable.world.message.js";
import { PlayerWorldCommand } from "@/rooms/world/player.world.command.js";

interface UseItemPayload {
    client: PlayerClient;
    payload: unknown;
}

/**
 * Dùng consumable: cách xử lý do `effects` trong metadata của item quyết định (bình hồi `restore`... — xem
 * `ConsumableWorldService`). Tất cả hiệu ứng phải dùng được thì mới trừ item trong `PlayerState` (global gửi lại
 * `inventoryChanged`) rồi áp dụng lần lượt.
 */
@SdkMessage({
    replies: [WorldMessage.POTION_USED],
    errors: [
        ItemErrorCode.ITEM_NOT_FOUND,
        ItemErrorCode.ITEM_NOT_USABLE,
        ItemErrorCode.ITEM_ALREADY_FULL,
        ItemErrorCode.ITEM_ON_COOLDOWN,
    ],
    note: "Thành công: chi tiết thay đổi của túi đến qua message `inventoryChanged` của global room.",
})
export class UseItemWorldCommand extends PlayerWorldCommand<UseItemPayload, typeof UseItemSchema> {
    static readonly message = WorldClientMessage.USE_ITEM;

    protected override readonly validateSchema = UseItemSchema;

    execute({ client }: UseItemPayload) {
        const { player } = this;
        const entry = player.inventories[ItemType.CONSUMABLE].find(
            (candidate) => candidate.id === this.body.instanceId
        );
        if (!entry) {
            this.result = Response.error(ItemErrorCode.ITEM_NOT_FOUND);
            return;
        }
        const item = itemService.getById(entry.itemId);
        const effects = (item?.metadata as ConsumableMetadata | undefined)?.effects ?? [];
        if (!item || effects.length === 0) {
            this.result = Response.error(ItemErrorCode.ITEM_NOT_USABLE);
            return;
        }

        for (const effect of effects) {
            const checked = player.checkConsumable(effect, this.clock.elapsedTime);
            if (Response.isError(checked)) {
                this.result = checked;
                return;
            }
        }

        const taken = player.applyOps([{ type: "takeItem", itemCode: item.code, quantity: 1 }]);
        if (Response.isError(taken)) {
            this.result = taken;
            return;
        }

        const gained: ConsumableGain = { hp: 0, mp: 0 };
        for (const effect of effects) {
            const result = player.applyConsumable(effect, this.clock.elapsedTime);
            gained.hp += result.hp;
            gained.mp += result.mp;
        }
        this.broadcastGain(client, gained);
        this.result = Response.success(null);
    }

    /** Báo cả room số HP / MP vừa hồi để hiện "+N" trên đầu người dùng (không hồi thì thôi). */
    private broadcastGain(client: PlayerClient, gained: ConsumableGain) {
        if (gained.hp <= 0 && gained.mp <= 0) return;
        const message: PotionUsedMessage = {
            playerId: client.auth.playerId,
            hp: gained.hp,
            mp: gained.mp,
        };
        RoomResponse.broadcast(this.room, WorldMessage.POTION_USED, message);
    }
}
