import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { fail, ok } from "@/core/utils/result.util.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import type { ConsumableMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { inventoryService } from "@/modules/player/services/inventory.service.js";
import { InventoryWorldCommand } from "@/rooms/world/modules/inventory/commands/inventory.world.command.js";
import {
    consumableWorldService,
    type ConsumableGain,
} from "@/rooms/world/modules/inventory/services/consumable.world.service.js";
import { UseItemSchema } from "@/rooms/world/modules/inventory/validators/inventory.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import {
    WorldClientMessage,
    WorldMessage,
    type PotionUsedMessage,
} from "@/rooms/world/types/world-message.type.js";
import type { z } from "zod";

/**
 * Dùng consumable: cách xử lý do `effects` trong metadata của item quyết định (bình hồi `restore`... — xem
 * `ConsumableWorldService`). Tất cả hiệu ứng phải dùng được thì mới trừ item rồi áp dụng
 * lần lượt. Túi gửi lại như mọi thao tác túi đồ.
 */
@SdkMessage({
    replies: [WorldMessage.POTION_USED],
    errors: [
        ItemErrorCode.ITEM_NOT_USABLE,
        ItemErrorCode.ITEM_ALREADY_FULL,
        ItemErrorCode.ITEM_ON_COOLDOWN,
    ],
})
export class UseItemWorldCommand extends InventoryWorldCommand<
    typeof UseItemSchema,
    ConsumableGain
> {
    static readonly message = WorldClientMessage.USE_ITEM;

    protected readonly validateSchema = UseItemSchema;
    protected run(player: PlayerWorldState, { instanceId }: z.infer<typeof UseItemSchema>) {
        const bag = player.inventories[ItemType.CONSUMABLE];
        const entry = bag.find((candidate) => candidate.id === instanceId);
        if (!entry) return fail(ItemErrorCode.ITEM_NOT_FOUND);
        const item = itemService.getById(entry.itemId);
        const effects = (item?.metadata as ConsumableMetadata | undefined)?.effects ?? [];
        if (!item || effects.length === 0) return fail(ItemErrorCode.ITEM_NOT_USABLE);

        const ctx = { room: this.room, player, now: this.clock.elapsedTime };
        for (const effect of effects) {
            const error = consumableWorldService.check(ctx, effect);
            if (error) return fail(error);
        }
        if (!inventoryService.removeFromInventory(bag, item.id, 1))
            return fail(ItemErrorCode.ITEM_NOT_FOUND);

        const gained: ConsumableGain = { hp: 0, mp: 0 };
        for (const effect of effects) {
            const result = consumableWorldService.apply(ctx, effect);
            gained.hp += result.hp;
            gained.mp += result.mp;
        }
        return ok(gained);
    }

    /** Báo cả room số HP / MP vừa hồi để hiện "+N" trên đầu người dùng (không hồi thì thôi). */
    protected override onSuccess(client: PlayerClient, gained: ConsumableGain) {
        if (gained.hp <= 0 && gained.mp <= 0) return;
        const message: PotionUsedMessage = {
            playerId: client.auth.playerId,
            hp: gained.hp,
            mp: gained.mp,
        };
        this.room.broadcastSuccess(WorldMessage.POTION_USED, message);
    }
}
