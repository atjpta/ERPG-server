export enum MapSpawnKind {
    /** Chỗ vào map mặc định (spawn của `spawnX/spawnY`). */
    DEFAULT = "default",
    /** Chỗ player hồi sinh khi chết trong map. */
    RESPAWN = "respawn",
    /** Điểm đến của portal/teleport từ map khác. */
    ARRIVAL = "arrival",
}
