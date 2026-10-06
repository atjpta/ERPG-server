import { levelService } from "@/modules/levels/services/level.service.js";
import {
    creditWallet,
    gainExp,
    levelUpPoints,
} from "@/modules/player/utils/player-progress.util.js";
import type { Reward } from "@/modules/rewards/types/reward.type.js";
import type { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import { WorldMessage, type RewardMessage } from "@/rooms/world/world.message.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { attributeWorldService } from "@/rooms/world/services/attribute.world.service.js";
import { inventoryWorldService } from "@/rooms/world/services/inventory.world.service.js";
import { itemService } from "@/modules/items/services/item.service.js";

/**
 * Cộng phần thưởng (tiền, item, exp → lên level) vào player đang online. Chỉ đổi state trong room;
 * checkpoint / lúc rời room lưu xuống DB (PlayerWorldState.toSavedState).
 */
export class RewardWorldService {
    grant(room: WorldRoom, sessionId: string, player: PlayerWorldState, reward: Reward): void {
        player.wallet = creditWallet(player.wallet, reward.currency);

        const progress = gainExp({ level: player.level, exp: player.exp }, reward.exp, (level) =>
            levelService.getExpToNext(level)
        );
        player.setLevelProgress(progress.level, progress.exp);
        if (progress.levelsGained > 0) {
            const points = levelUpPoints(progress.levelsGained);
            player.attributePoints += points.attributePoints;
            player.skillPoints += points.skillPoints;
            // Lên level hồi đầy trạng thái.
            player.restoreFull();
        }

        const message: RewardMessage = {
            exp: reward.exp,
            currency: reward.currency,
            items: reward.items.map((drop) => {
                const item = itemService.getById(drop.itemId);
                return {
                    ...drop,
                    code: item?.code,
                    rarity: drop.metadata?.rarity ?? item?.rarity,
                };
            }),
            level: progress.level,
            levelsGained: progress.levelsGained,
        };
        const client = room.clients.getById(sessionId);
        client?.send(WorldMessage.REWARD, message);
        if (reward.items.length > 0) inventoryWorldService.grantItems(client, player, reward.items);
        // Lên level: có thêm điểm tiềm năng và stat đổi theo level.
        if (progress.levelsGained > 0) attributeWorldService.send(client, player);
    }
}

export const rewardWorldService = new RewardWorldService();
