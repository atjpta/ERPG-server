import type { GameRoomOptions } from "@/core/rooms/base-game.room.js";

export interface WorldRoomOptions extends GameRoomOptions {
    mapCode: string;
    /** Chỉ room `dungeon`: id instance server cấp lúc vào dungeon. */
    instanceId?: string;
    /** Chỉ server đặt (xem `InitRoom`): room kênh đầu của map, không tự đóng khi vắng người. Client không được gửi. */
    persistent?: boolean;
}
