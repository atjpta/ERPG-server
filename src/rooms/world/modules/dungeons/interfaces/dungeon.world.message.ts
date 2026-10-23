import type { CurrencyRewardMessage } from "@/rooms/world/modules/rewards/interfaces/reward.world.message.js";
import type { ItemRewardMessage } from "@/modules/rewards/interfaces/reward.message.js";

export interface DungeonChamberClearMessage {
    chamberIndex: number;
    chamberCount: number;
}

/** Những gì 1 người nhận được trong lần đi dungeon này (chamber, clear, quái rơi) — bảng thưởng sau khi clear. */
export interface DungeonRewardMemberMessage {
    playerId: string;
    name: string;
    classCode: string;
    level: number;
    exp: number;
    currency: CurrencyRewardMessage[];
    items: ItemRewardMessage[];
}

export interface DungeonClearMessage {
    /** Giây nữa người chơi bị đưa ra ngoài. */
    leaveInSec: number;
    /** Phần thưởng của từng người trong nhóm (tối đa 4, theo thứ tự vào). */
    members: DungeonRewardMemberMessage[];
    /** Chủ nhóm — chỉ người này được bấm "đi lại" (rỗng = không rõ, ai cũng thử được và server quyết). */
    leaderPlayerId: string;
}
