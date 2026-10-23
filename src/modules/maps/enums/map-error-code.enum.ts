import { registerErrorCodes } from "@/core/utils/error-code.util.js";

/** Mã lỗi map, teleport và dungeon. */
export enum MapErrorCode {
    /** Mã map đã tồn tại (admin). */
    MAP_CODE_EXISTS = "MAP_CODE_EXISTS",
    /** Map không tồn tại hoặc không hoạt động. */
    MAP_NOT_FOUND = "MAP_NOT_FOUND",
    /** Map chưa mở / đang đóng. */
    MAP_NOT_OPEN = "MAP_NOT_OPEN",
    /** Lối ra đang khoá (dungeon: cổng chamber chưa mở). */
    MAP_EXIT_LOCKED = "MAP_EXIT_LOCKED",
    /** Đang trong quá trình chuyển map. Bỏ qua, đừng gửi lại. */
    MAP_ALREADY_CHANGING = "MAP_ALREADY_CHANGING",
    /** Điểm xuất hiện (spawn) ở map đích không tồn tại (lỗi dữ liệu map). */
    MAP_SPAWN_NOT_FOUND = "MAP_SPAWN_NOT_FOUND",
    /** Phải đứng gần một bệ teleport mới dịch chuyển được. */
    TELEPORT_NOT_AT_PAD = "TELEPORT_NOT_AT_PAD",
    /** Map đích không có bệ teleport để đến. */
    TELEPORT_NO_DESTINATION = "TELEPORT_NO_DESTINATION",
    /** Chưa khám phá bệ teleport ở map đích. */
    TELEPORT_NOT_DISCOVERED = "TELEPORT_NOT_DISCOVERED",
    /** Không đang ở trong dungeon. */
    DUNGEON_NOT_IN = "DUNGEON_NOT_IN",
    /** Đã đang trong một lượt dungeon. */
    DUNGEON_ALREADY_IN = "DUNGEON_ALREADY_IN",
    /** Dungeon không còn / không đi lại được. */
    DUNGEON_UNAVAILABLE = "DUNGEON_UNAVAILABLE",
    /** Có thành viên không đủ điều kiện vào dungeon nên cả nhóm không vào. `error: { dungeonCode, failures: [{ playerId, name, reason }] }` (reason = mã lỗi từng người). */
    DUNGEON_DENIED = "DUNGEON_DENIED",
    /** Nhóm đang trong quá trình vào dungeon (yêu cầu trước chưa xong). Bỏ qua, đừng gửi lại. */
    DUNGEON_LAUNCHING = "DUNGEON_LAUNCHING",
    /** Cả nhóm chưa cùng ở trong dungeon để đi lại. */
    DUNGEON_NOT_TOGETHER = "DUNGEON_NOT_TOGETHER",
}

registerErrorCodes(MapErrorCode);
