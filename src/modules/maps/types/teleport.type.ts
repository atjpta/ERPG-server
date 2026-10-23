export interface TeleportDestination {
    mapCode: string;
    /** Bệ teleport đầu tiên của map — chỗ người chơi xuất hiện (không có khi `open = false`). */
    teleportId?: string;
    minLevel: number;
    x?: number;
    y?: number;
    /** Map có bệ teleport đã đặt vị trí và đang mở — `false` thì vẫn hiện trong danh sách nhưng chưa đi được. */
    open: boolean;
    /** Bệ teleport của map khai `openToAll`: không cần đã từng đến map này. */
    openToAll?: boolean;
}

export interface TeleportStatus {
    /** Đã từng đến map đó. */
    discovered: boolean;
    /** Đủ level vào map đó. */
    levelOk: boolean;
    /** Teleport tới được ngay (đã đến + đủ level + map có bệ đang mở). */
    available: boolean;
}
