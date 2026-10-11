import { z } from "zod";

/** Master data `party_config`. */
export const PartyConfigSchema = z.object({
    /** Số thành viên tối đa (≤ `maxPlayersPerChannel` của dungeon). */
    maxMembers: z.number().int().min(1).max(10),
    /** Lời mời hết hạn sau chừng này giây. */
    inviteTtlSec: z.number().int().positive(),
    /** Mỗi người thêm (ngoài người đầu) cộng thêm bấy nhiêu phần trăm vào tổng exp chia (0.1 = +10%). */
    expBonusPerExtraMember: z.number().min(0),
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
