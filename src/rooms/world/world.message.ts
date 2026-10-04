import type { CurrencyReward } from "@/modules/rewards/types/reward.type.js";
import type { Attributes, Stats } from "@/modules/player/schemas/stat.schema.js";

/** Message client → server của room world. */
export enum WorldClientMessage {
    /** `{ strength?, dexterity?, intelligence?, vitality?, luck? }` — số điểm tiềm năng muốn cộng. */
    ALLOCATE_ATTRIBUTES = "allocateAttributes",
}

/** Message server → client của room world (ngoài state). */
export enum WorldMessage {
    /** Gửi riêng cho người nhận thưởng — client hiện chữ nổi "+exp / +gold / level up". */
    REWARD = "reward",
    /** Trả lời `allocateAttributes` (kể cả khi lỗi) — điểm còn lại, attribute và stat sau khi tính lại. */
    ATTRIBUTES = "attributes",
}

export interface RewardMessage {
    exp: number;
    currency: CurrencyReward[];
    /** Level sau khi cộng exp. */
    level: number;
    /** Số level vừa lên (0 = không lên). */
    levelsGained: number;
}

export interface AttributeSummary {
    attributePoints: number;
    /** Điểm player đã tự cộng. */
    allocatedAttributes: Attributes;
    /** Attribute cuối cùng (class + đã cộng + trang bị). */
    attributes: Attributes;
    stats: Stats;
}

export interface AttributesMessage extends AttributeSummary {
    ok: boolean;
    error?: string;
}
