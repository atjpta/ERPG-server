export { PartyLootMode } from "@/modules/master-data/enums/party-loot-mode.enum.js";
export {
    PartyConfigSchema,
    type PartyConfig,
} from "@/modules/master-data/schemas/party-config.schema.js";
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
