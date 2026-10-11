import { z } from "zod";

/** Cách chia item rơi khi đánh quái (chủ party đổi được). Vàng chia theo `shareGold`. */
export enum PartyLootMode {
    /** Người kết liễu nhận hết item. */
    KILLER = "killer",
    /** Luân phiên giữa các thành viên đủ điều kiện, mỗi item một người. */
    ROUND_ROBIN = "round_robin",
    /** Ngẫu nhiên một người đủ điều kiện cho mỗi item. */
    RANDOM = "random",
}

/** Master data `party_config`. */
export const PartyConfigSchema = z.object({
    /** Số thành viên tối đa (≤ `maxPlayersPerChannel` của dungeon). */
    maxMembers: z.number().int().min(1).max(10),
    /** Lời mời hết hạn sau chừng này giây. */
    inviteTtlSec: z.number().int().positive(),
    /** Mỗi người thêm (ngoài người đầu) cộng thêm bấy nhiêu phần trăm vào tổng exp chia (0.1 = +10%). */
    expBonusPerExtraMember: z.number().min(0),
    /**
     * Thành viên chỉ được chia thưởng nếu chênh level với quái không quá chừng này (chống kéo cày /
     * hưởng ké); người kết liễu luôn được tính. 0 = không giới hạn.
     */
    maxLevelGap: z.number().int().min(0).default(10),
    /** Chia vàng đều cho thành viên đủ điều kiện (phần dư về người kết liễu); tắt = người kết liễu giữ hết. */
    shareGold: z.boolean().default(true),
    /** Cách chia item mặc định của party mới. */
    lootMode: z.enum(PartyLootMode).default(PartyLootMode.ROUND_ROBIN),
});
export type PartyConfig = z.infer<typeof PartyConfigSchema>;

/** Lý do không cho cả party vào dungeon (gửi cho toàn party). */
export enum PartyDungeonDenyReason {
    LEVEL_TOO_LOW = "level_too_low",
    /** Chưa gắn world room (đang chuyển map / vừa thoát). */
    OFFLINE = "offline",
    DEAD = "dead",
    IN_DUNGEON = "in_dungeon",
    PARTY_TOO_LARGE = "party_too_large",
}

/** Thông tin thành viên mà party room giữ (và gửi cho client qua Schema). */
export interface PartyMemberInfo {
    playerId: string;
    name: string;
    level: number;
    hp: number;
    maxHp: number;
    mapCode: string;
    inWorld: boolean;
    inDungeon: boolean;
}
