import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { Response } from "@/core/utils/response.util.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import type { ConsumableMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { itemService } from "@/modules/items/services/item.service.js";
import type { ConsumableGain } from "@/rooms/world/modules/players/types/consumable.world.type.js";
import { UseItemSchema } from "@/rooms/world/modules/consumables/validators/consumable.world.validator.js";
import { playerDataWorldService } from "@/rooms/world/modules/players/services/player-data.world.service.js";
import { WorldClientMessage, WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type { PotionUsedMessage } from "@/rooms/world/modules/consumables/interfaces/consumable.world.message.js";
import { PlayerWorldCommand } from "@/rooms/world/player.world.command.js";

interface UseItemPayload {
    client: PlayerClient;
    payload: unknown;
}

/** Player đang chờ global trừ bình — chặn bấm liên tiếp trong lúc chờ (tránh trừ hai bình cho một lần hồi). */
const usingPlayers = new Set<string>();

/**
 * Dùng consumable: cách xử lý do `effects` trong metadata của item quyết định (bình hồi `restore`... — xem
 * `ConsumableWorldService`). Tất cả hiệu ứng phải dùng được thì mới nhờ global trừ item (túi do global làm chủ, global
 * gửi lại `inventory`) rồi áp dụng lần lượt.
 */
@SdkMessage({
    replies: [WorldMessage.POTION_USED],
    errors: [
        ItemErrorCode.ITEM_NOT_FOUND,
        ItemErrorCode.ITEM_NOT_USABLE,
        ItemErrorCode.ITEM_ALREADY_FULL,
        ItemErrorCode.ITEM_ON_COOLDOWN,
    ],
    note: "Thành công: túi mới đến qua message `inventory` của global room.",
})
export class UseItemWorldCommand extends PlayerWorldCommand<UseItemPayload, typeof UseItemSchema> {
    static readonly message = WorldClientMessage.USE_ITEM;

    protected override readonly validateSchema = UseItemSchema;

    async execute({ client }: UseItemPayload) {
        const { room, player } = this;
        const { playerId } = client.auth;
        if (usingPlayers.has(playerId)) {
            this.result = Response.error(ItemErrorCode.ITEM_ON_COOLDOWN);
            return;
        }

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
            const error = player.checkConsumable(effect, this.clock.elapsedTime);
            if (error) {
                this.result = Response.error(error);
                return;
            }
        }

        usingPlayers.add(playerId);
        let taken;
        try {
            taken = await playerDataWorldService.apply(room, playerId, [
                { type: "takeItem", itemCode: item.code, quantity: 1 },
            ]);
        } finally {
            usingPlayers.delete(playerId);
        }
        if (Response.isError(taken)) {
            this.result = taken;
            return;
        }

        // Đã rời room trong lúc chờ global thì không còn gì để hồi.
        if (room.state.players.get(playerId) === player) {
            const gained: ConsumableGain = { hp: 0, mp: 0 };
            for (const effect of effects) {
                const result = player.applyConsumable(effect, this.clock.elapsedTime);
                gained.hp += result.hp;
                gained.mp += result.mp;
            }
            this.broadcastGain(client, gained);
        }
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
        this.room.broadcastSuccess(WorldMessage.POTION_USED, message);
    }
}
