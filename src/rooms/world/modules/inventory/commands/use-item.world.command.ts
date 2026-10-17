import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { removeFromInventory } from "@/modules/player/services/inventory.service.js";
import { InventoryWorldCommand } from "@/rooms/world/modules/inventory/commands/inventory.world.command.js";
import {
    done,
    fail,
    POTION_COOLDOWN_MS,
} from "@/rooms/world/modules/inventory/services/inventory.world.service.js";
import { UseItemSchema } from "@/rooms/world/modules/inventory/validators/inventory.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import {
    WorldClientMessage,
    WorldMessage,
    type PotionUsedMessage,
} from "@/rooms/world/types/world-message.type.js";
import type { z } from "zod";

/** Dùng bình: HP/MP đổi theo state của player (vitals tự đồng bộ), túi gửi lại như mọi thao tác túi đồ. */
export class UseItemWorldCommand extends InventoryWorldCommand<
    typeof UseItemSchema,
    { hp: number; mp: number }
> {
    static readonly message = WorldClientMessage.USE_ITEM;

    protected readonly schema = UseItemSchema;
    protected run(player: PlayerWorldState, { instanceId }: z.infer<typeof UseItemSchema>) {
        const now = this.clock.elapsedTime;
        const bag = player.inventories[ItemType.CONSUMABLE];
        const entry = bag.find((candidate) => candidate.id === instanceId);
        if (!entry) return fail("Item not found");
        const item = itemService.getById(entry.itemId);
        const metadata = (item?.metadata ?? {}) as { heal?: unknown; mana?: unknown };
        const heal = typeof metadata.heal === "number" ? metadata.heal : 0;
        const mana = typeof metadata.mana === "number" ? metadata.mana : 0;
        if (!item || (heal <= 0 && mana <= 0)) return fail("Item not usable");
        const usefulHp = heal > 0 && player.hp < player.maxHp;
        const usefulMp = mana > 0 && player.mp < player.maxMp;
        if (!usefulHp && !usefulMp) return fail("Already full");
        if (
            (heal > 0 && now < player.hpPotionReadyAt) ||
            (mana > 0 && now < player.mpPotionReadyAt)
        ) {
            return fail("Potion cooldown");
        }

        if (!removeFromInventory(bag, item.id, 1)) return fail("Item not found");
        if (heal > 0) player.hpPotionReadyAt = now + POTION_COOLDOWN_MS;
        if (mana > 0) player.mpPotionReadyAt = now + POTION_COOLDOWN_MS;
        player.syncPotionCooldowns(now);
        const hpBefore = player.hp;
        const mpBefore = player.mp;
        if (usefulHp) player.hp = Math.min(player.maxHp, player.hp + heal);
        if (usefulMp) player.mp = Math.min(player.maxMp, player.mp + mana);
        return done({ hp: player.hp - hpBefore, mp: player.mp - mpBefore });
    }

    /** Báo cả room số HP / MP vừa hồi để hiện "+N" trên đầu người uống. */
    protected override onSuccess(client: PlayerClient, gained: { hp: number; mp: number }) {
        const message: PotionUsedMessage = {
            sessionId: client.sessionId,
            hp: gained.hp,
            mp: gained.mp,
        };
        this.room.broadcast(WorldMessage.POTION_USED, message);
    }
}
