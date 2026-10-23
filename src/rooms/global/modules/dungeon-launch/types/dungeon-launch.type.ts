/** Yêu cầu từ world: chủ muốn cả party vào dungeon (lần đầu hoặc "đi lại" sau khi clear). */
export interface DungeonLaunchRequest {
    leaderPlayerId: string;
    code: string;
    spawnId: string;
    retry: boolean;
    /** Chỉ khi `retry`: những người còn ở dungeon cũ — thiếu ai là không đi. */
    presentPlayerIds?: string[];
}
