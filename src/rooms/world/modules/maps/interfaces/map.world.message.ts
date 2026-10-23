import type { WorldRoomName } from "@/rooms/world/modules/maps/enums/world-room-name.enum.js";

export interface MapChangeMessage {
    mapCode: string;
    /** Điểm đến trong map mới (id spawn point). */
    spawnId: string;
    /** Room cần join: `world` (filter `mapCode`) hoặc `dungeon` (filter `instanceId`, kèm `mapCode`). */
    roomName: WorldRoomName;
    /** Chỉ dungeon: id instance — join room `dungeon` với option `{ mapCode, instanceId }`. */
    instanceId?: string;
}

export interface TeleportDestinationMessage {
    mapCode: string;
    minLevel: number;
    /** Map có bệ teleport đã đặt và đang mở — `false` thì hiện mờ, không chọn được. */
    open: boolean;
    /** Đã từng đến map này — chưa đến thì chưa teleport tới được. */
    discovered: boolean;
    /** Teleport tới được ngay: đã đến map này và đủ level. */
    available: boolean;
}

export interface TeleportListMessage {
    destinations: TeleportDestinationMessage[];
}
