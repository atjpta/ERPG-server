import type { CollisionBounds } from "@/core/types/collision-bounds.type.js";
import type { PartyLootMode } from "@/modules/master-data/enums/party-loot-mode.enum.js";
import type { Attributes, Stats } from "@/modules/player/schemas/stat.schema.js";
import type { PlayerSavedState } from "@/modules/player/types/player-fields.type.js";
import type { OwnedSkill } from "@/modules/skills/schemas/skill-config.schema.js";

/** Bản chụp dữ liệu tick-by-tick của world (vị trí, HP/MP...) tại thời điểm lưu. */
export type PlaceCapture = Pick<
    PlayerSavedState,
    "mapCode" | "x" | "y" | "direction" | "hp" | "mp" | "dungeonSession"
>;

/** Cột `player_states` runtime chỉ đọc (không đổi lúc đang chơi). */
export interface PlayerExtras {
    skills: OwnedSkill[];
    hitbox: CollisionBounds;
    collider: CollisionBounds;
}

/** World room hiện giữ player: nơi họ đang đứng (global dùng cho bạn bè, party, chat). */
export interface PlayerPresence {
    worldRoomId: string;
    mapCode: string;
    instanceId?: string;
    /** Lần cuối world xác nhận còn giữ player (ms). */
    seenAt: number;
}

/** Party hiện tại của player (global ghi, world đọc để chia loot và hiển thị). */
export interface PlayerPartyState {
    partyId: string;
    lootMode: PartyLootMode;
}

/** Chi tiết của `PRESENCE_CHANGED`. */
export interface PresenceChange {
    previous?: PlayerPresence;
    /** Rời world để sang world room khác (đổi map / dungeon): party giữ nguyên. */
    changingMap: boolean;
}

/** Điểm + thuộc tính + stats của player (gửi client dưới dạng push `attributes`). */
export interface AttributeSummary {
    attributePoints: number;
    allocatedAttributes: Attributes;
    attributes: Attributes;
    stats: Stats;
}
