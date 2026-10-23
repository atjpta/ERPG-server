/** Presence topic báo `playerId` vừa đổi tên (publisher và room subscribe dùng chung, đi được qua nhiều process). */
export const playerRenameTopic = (playerId: string) => `player:renamed:${playerId}`;
