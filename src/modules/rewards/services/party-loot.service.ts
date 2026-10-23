import type { Reward } from "@/modules/rewards/types/reward.type.js";
import { PartyLootMode } from "@/modules/master-data/enums/party-loot-mode.enum.js";
import type {
    ShareOptions,
    ShareParticipant,
    ShareResult,
} from "@/modules/rewards/types/party-loot.type.js";

/** Tính cách chia thưởng hạ quái cho party (hàm thuần, không đụng state hay room). */
export class PartyLootService {
    /**
     * Chia thưởng hạ quái cho party. Đủ điều kiện = người kết liễu + thành viên chênh level với quái không
     * quá `maxLevelGap` (0 = không giới hạn). Chỉ 1 người đủ điều kiện → người đó nhận hết. Ngược lại:
     * - exp: tổng được cộng `expBonusPerExtraMember × (n − 1)` rồi chia đều cho `n` người, làm tròn xuống;
     * - vàng chia đều (phần dư về người kết liễu) nếu `shareGold`, không thì người kết liễu giữ hết;
     * - mỗi item (cả stack) giao cho một người theo `lootMode`.
     */
    shareKillReward(
        reward: Reward,
        killerId: string,
        participants: readonly ShareParticipant[],
        monsterLevel: number,
        options: ShareOptions
    ): ShareResult {
        const eligible = participants.filter(
            (p) =>
                p.id === killerId ||
                options.maxLevelGap === 0 ||
                Math.abs(p.level - monsterLevel) <= options.maxLevelGap
        );
        if (eligible.length <= 1) {
            return { rewards: new Map([[killerId, reward]]), nextCursor: options.cursor };
        }

        const exp =
            reward.exp <= 0
                ? 0
                : Math.floor(
                      (reward.exp * (1 + options.expBonusPerExtraMember * (eligible.length - 1))) /
                          eligible.length
                  );
        const rewards = new Map<string, Reward>(
            eligible.map((p): [string, Reward] => [
                p.id,
                { currency: [], items: [], source: reward.source, exp },
            ])
        );
        const killerReward = rewards.get(killerId)!;

        for (const currency of reward.currency) {
            if (!options.shareGold) {
                killerReward.currency.push(currency);
                continue;
            }
            const share = Math.floor(currency.amount / eligible.length);
            const remainder = currency.amount - share * eligible.length;
            for (const p of eligible) {
                const amount = share + (p.id === killerId ? remainder : 0);
                if (amount > 0) rewards.get(p.id)!.currency.push({ code: currency.code, amount });
            }
        }

        const rng = options.rng ?? Math.random;
        let cursor = options.cursor;
        for (const item of reward.items) {
            let recipient = killerId;
            if (options.lootMode === PartyLootMode.ROUND_ROBIN) {
                recipient = eligible[cursor % eligible.length].id;
                cursor++;
            } else if (options.lootMode === PartyLootMode.RANDOM) {
                recipient = eligible[Math.floor(rng() * eligible.length)].id;
            }
            rewards.get(recipient)!.items.push(item);
        }
        return { rewards, nextCursor: cursor };
    }
}

export const partyLootService = new PartyLootService();
