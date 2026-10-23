import type { PlayerIdentity } from "@/modules/auth/entities/player.entity.js";
import type { PlayerStatus } from "@/modules/auth/enums/player-status.enum.js";
import type { PlayerDatas } from "@/modules/player/entities/player-data.entity.js";

export type PlayerWithState = PlayerIdentity &
    Omit<PlayerDatas, "playerId" | "updatedAt" | "revision">;

export type PlayerSnapshot = PlayerWithState & { stateRevision: number };

/** 1 ô nhân vật ở màn chọn nhân vật. */
export interface CharacterSummary {
    id: string;
    name: string;
    classCode: string;
    /** Class tier 1 gốc của `classCode` (client dùng hình của class này khi class sau chưa có hình). */
    baseClassCode: string;
    level: number;
    status: PlayerStatus;
    lastPlayedAt: Date | null;
}

/** Giới hạn tạo nhân vật (master data `player_config`). */
export interface CharacterLimits {
    maxCharacters: number;
    nameMinLength: number;
    nameMaxLength: number;
}
