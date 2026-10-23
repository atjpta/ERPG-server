/** Dòng `player_states` đổi bởi bên ngoài và không gộp được sau vài lần thử. */
export class PlayerStateConflictError extends Error {}

/** Dòng `player_states` không còn (nhân vật bị xoá khi đang online): không còn gì để lưu. */
export class PlayerGoneError extends Error {}
