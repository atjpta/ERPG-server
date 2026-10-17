export interface DungeonExpectation {
    dungeonCode: string;
    leaderPlayerId: string;
    /** Người sẽ vào instance — dungeon room chờ đủ rồi mới bắt đầu. */
    expected: string[];
}
