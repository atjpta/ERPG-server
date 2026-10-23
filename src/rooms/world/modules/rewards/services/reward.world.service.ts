import { itemService } from "@/modules/items/services/item.service.js";
import { playerService } from "@/modules/player/services/player.service.js";
import type { Reward } from "@/modules/rewards/types/reward.type.js";
import { recordReward } from "@/rooms/world/modules/dungeons/utils/dungeon-reward.world.util.js";
import { playerDataWorldService } from "@/rooms/world/modules/players/services/player-data.world.service.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type {
    RewardMessage,
    WalletMessage,
} from "@/rooms/world/modules/rewards/interfaces/reward.world.message.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/**
 * Cộng phần thưởng (tiền, item, exp → lên level) vào player đang online. Tiền / exp / level đổi ngay trong room
 * (checkpoint / lúc rời room lưu xuống DB qua global); item và điểm khi lên level do global làm chủ nên gom lại gửi
 * sang global (`PlayerDataWorldService.queue`).
 */
export class RewardWorldService {
    /**
     * `recordInDungeon`: ghi vào bảng thưởng dungeon (`DUNGEON_CLEAR`) — chỉ phần thưởng clear dungeon bật cờ
     * này, drop quái dọc đường không vào bảng. `queueItems = false`: item đã được cộng riêng qua global
     * (`PlayerDataWorldService.apply`), chỉ báo client.
     */
    grant(
        room: WorldRoom,
        playerId: string,
        player: PlayerWorldState,
        reward: Reward,
        recordInDungeon = false,
        queueItems = true
    ): void {
        const progress = player.gainCurrencyAndExp(reward.currency, reward.exp);
        if (progress.levelsGained > 0) {
            const points = playerService.levelUpPoints(progress.levelsGained);
            playerDataWorldService.queue(room, playerId, [{ type: "addPoints", ...points }]);
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
        if (client) client.sendSuccess(WorldMessage.REWARD, message);
        if (reward.currency.some((currency) => currency.amount > 0)) {
            const wallet: WalletMessage = player.wallet;
            if (client) client.sendSuccess(WorldMessage.WALLET, wallet);
        }
        if (queueItems && reward.items.length > 0) {
            playerDataWorldService.queue(room, playerId, [
                { type: "giveItem", items: reward.items, source: reward.source },
            ]);
        }
    }
}

export const rewardWorldService = new RewardWorldService();
