import type { Reward } from "@/modules/rewards/types/reward.type.js";
import type { PartyLootMode } from "@/rooms/party/schemas/party.schema.js";

export interface ShareParticipant {
    id: string;
    level: number;
}

export interface ShareOptions {
    expBonusPerExtraMember: number;
    /** 0 = không giới hạn. */
    maxLevelGap: number;
    shareGold: boolean;
    lootMode: PartyLootMode;
    /** Con trỏ luân phiên (round robin) — trả về giá trị mới trong `nextCursor`. */
    cursor: number;
    rng?: () => number;
}

export interface ShareResult {
    /** Phần thưởng của từng người đủ điều kiện (người không đủ điều kiện không có mặt). */
    rewards: Map<string, Reward>;
    nextCursor: number;
}
