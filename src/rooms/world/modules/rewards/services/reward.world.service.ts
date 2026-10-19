import { sendOk } from "@/core/utils/room-send.util.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { levelService } from "@/modules/levels/services/level.service.js";
import {
    creditWallet,
    gainExp,
    levelUpPoints,
} from "@/modules/player/services/player-progress.service.js";
import type { Reward } from "@/modules/rewards/types/reward.type.js";
import { recordReward } from "@/rooms/world/modules/dungeons/utils/dungeon-reward.world.util.js";
import { inventoryWorldService } from "@/rooms/world/modules/inventory/services/inventory.world.service.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { attributeWorldService } from "@/rooms/world/modules/players/services/attribute.world.service.js";
import {
    WorldMessage,
    type RewardMessage,
    type WalletMessage,
} from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/**
 * Cộng phần thưởng (tiền, item, exp → lên level) vào player đang online. Chỉ đổi state trong room;
 * checkpoint / lúc rời room lưu xuống DB (PlayerWorldState.toSavedState).
 */
export class RewardWorldService {
    /**
     * `recordInDungeon`: ghi vào bảng thưởng dungeon (`DUNGEON_CLEAR`) — chỉ phần thưởng clear dungeon bật cờ
     * này, drop quái dọc đường không vào bảng.
     */
    grant(
        room: WorldRoom,
        playerId: string,
        player: PlayerWorldState,
        reward: Reward,
        recordInDungeon = false
    ): void {
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
        const tally = recordInDungeon ? room.dungeon?.rewards.get(player.id) : undefined;
        if (tally) recordReward(tally, message, progress.level);
        const client = room.clientOf(playerId);
        if (client) sendOk(client, WorldMessage.REWARD, message);
        if (reward.currency.some((currency) => currency.amount > 0)) {
            const wallet: WalletMessage = player.wallet;
            if (client) sendOk(client, WorldMessage.WALLET, wallet);
        }
        if (reward.items.length > 0)
            inventoryWorldService.grantItems(client, player, reward.items, reward.source);
        // Lên level: có thêm điểm tiềm năng và stat đổi theo level.
        if (progress.levelsGained > 0) attributeWorldService.send(client, player);
    }
}

export const rewardWorldService = new RewardWorldService();
