import type { ErrorCode } from "@/core/types/result.type.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { ConsumableEffectType } from "@/modules/items/enums/item.enum.js";
import type { ConsumableEffect } from "@/modules/items/schemas/item-metadata.schema.js";
import { POTION_COOLDOWN_MS } from "@/rooms/world/modules/inventory/services/inventory.world.service.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

export interface ConsumableContext {
    room: WorldRoom;
    player: PlayerWorldState;
    /** `clock.elapsedTime` của room (ms) — mốc tính cooldown. */
    now: number;
}

/** HP / MP thực sự hồi được (hiện "+N" trên đầu người dùng); hiệu ứng khác = 0. */
export interface ConsumableGain {
    hp: number;
    mp: number;
}

/**
 * Xử lý hiệu ứng của consumable (`ConsumableEffect`). Mỗi loại có hai bước: `check` (có dùng được
 * không — chưa đổi state) rồi `apply` (đổi state). Command gọi `check` cho mọi hiệu ứng trước khi trừ
 * item, nên item chỉ mất khi cả danh sách hiệu ứng đều dùng được.
 */
export class ConsumableWorldService {
    check(
        { room, player, now }: ConsumableContext,
        effect: ConsumableEffect
    ): ErrorCode | undefined {
        switch (effect.type) {
            case ConsumableEffectType.RESTORE: {
                const usefulHp = effect.hp > 0 && player.hp < player.maxHp;
                const usefulMp = effect.mp > 0 && player.mp < player.maxMp;
                if (!usefulHp && !usefulMp) return ItemErrorCode.ITEM_ALREADY_FULL;
                if (
                    (usefulHp && now < player.hpPotionReadyAt) ||
                    (usefulMp && now < player.mpPotionReadyAt)
                ) {
                    return ItemErrorCode.ITEM_ON_COOLDOWN;
                }
                return undefined;
            }
        }
    }

    apply({ room, player, now }: ConsumableContext, effect: ConsumableEffect): ConsumableGain {
        switch (effect.type) {
            case ConsumableEffectType.RESTORE: {
                const hpBefore = player.hp;
                const mpBefore = player.mp;
                if (effect.hp > 0 && player.hp < player.maxHp) {
                    player.hpPotionReadyAt = now + POTION_COOLDOWN_MS;
                    player.hp = Math.min(player.maxHp, player.hp + effect.hp);
                }
                if (effect.mp > 0 && player.mp < player.maxMp) {
                    player.mpPotionReadyAt = now + POTION_COOLDOWN_MS;
                    player.mp = Math.min(player.maxMp, player.mp + effect.mp);
                }
                player.syncPotionCooldowns(now);
                return { hp: player.hp - hpBefore, mp: player.mp - mpBefore };
            }
        }
    }
}

export const consumableWorldService = new ConsumableWorldService();
