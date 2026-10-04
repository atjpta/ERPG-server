import type { CurrencyReward } from "@/modules/rewards/types/reward.type.js";

/** Message server → client của room world (ngoài state). */
export enum WorldMessage {
    /** Gửi riêng cho người nhận thưởng — client hiện chữ nổi "+exp / +gold / level up". */
    REWARD = "reward",
}

export interface RewardMessage {
    exp: number;
    currency: CurrencyReward[];
    /** Level sau khi cộng exp. */
    level: number;
    /** Số level vừa lên (0 = không lên). */
    levelsGained: number;
}
