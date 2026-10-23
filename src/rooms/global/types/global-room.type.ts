import type { GameRoomOptions } from "@/core/rooms/base-game.room.js";

/** Tên đăng ký của global room trong `index.room.ts`. */
export const GLOBAL_ROOM_NAME = "global";

/** Options khi tạo / join global room: mỗi `serverId` một room (`filterBy`); phải khớp `serverId` trong token. */
export type GlobalRoomOptions = GameRoomOptions;
