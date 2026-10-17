export { PartyLootMode } from "@/modules/master-data/enums/party-loot-mode.enum.js";
export {
    PartyConfigSchema,
    type PartyConfig,
} from "@/modules/master-data/schemas/party-config.schema.js";
/** Lý do không cho cả party vào dungeon (gửi cho toàn party). */
export enum PartyDungeonDenyReason {
    LEVEL_TOO_LOW = "level_too_low",
    /** Chưa gắn world room (đang chuyển map / vừa thoát). */
    OFFLINE = "offline",
    DEAD = "dead",
    IN_DUNGEON = "in_dungeon",
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
