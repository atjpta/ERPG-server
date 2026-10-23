/* DTO điều phối dungeon gửi xuống client (`yarn unity:network` sinh C#: interface tên kết thúc `Message`). */

export interface PartyDungeonFailureMessage {
    playerId: string;
    name: string;
    /** Mã lỗi (`ErrorCode`): `LEVEL_TOO_LOW`, `PLAYER_OFFLINE`, `PLAYER_DEAD` hoặc `DUNGEON_ALREADY_IN`. */
    reason: string;
}

export interface PartyDungeonDeniedMessage {
    dungeonCode: string;
    failures: PartyDungeonFailureMessage[];
}
