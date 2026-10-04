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

/**
 * Cộng phần thưởng (tiền, exp → lên level) vào player đang online. Chỉ đổi state trong room;
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
            level: progress.level,
            levelsGained: progress.levelsGained,
        };
        room.clients.getById(sessionId)?.send(WorldMessage.REWARD, message);
    }
}

export const rewardWorldService = new RewardWorldService();
