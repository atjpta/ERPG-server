import { registerErrorCodes } from "@/core/response/error-code.js";

/** Mã lỗi chung (core): dùng được ở mọi tầng. */
export enum CommonCode {
    /** Yêu cầu không hợp lệ (HTTP 400) — lỗi chung khi không có mã cụ thể hơn. */
    BAD_REQUEST = "BAD_REQUEST",
    /** Chưa xác thực (HTTP 401). */
    UNAUTHORIZED = "UNAUTHORIZED",
    /** Không đủ quyền (HTTP 403). */
    FORBIDDEN = "FORBIDDEN",
    /** Không tìm thấy tài nguyên (HTTP 404). Với room: id/đối tượng thao tác không tồn tại. */
    NOT_FOUND = "NOT_FOUND",
    /** Xung đột trạng thái (HTTP 409). */
    CONFLICT = "CONFLICT",
    /** Dữ liệu gửi lên sai định dạng (HTTP 422). `error.issues[]` = `{ path, message }`. Lỗi lập trình client, không hiện cho người chơi. */
    INVALID_INPUT = "INVALID_INPUT",
    /** Thiếu token đăng nhập (HTTP 401). Client xoá phiên và đưa về màn đăng nhập. */
    MISSING_TOKEN = "MISSING_TOKEN",
    /** Token hết hạn hoặc không hợp lệ (HTTP 401). Client xoá phiên và đưa về màn đăng nhập. */
    INVALID_TOKEN = "INVALID_TOKEN",
    /** Gọi quá nhanh (HTTP 429, header `retry-after` giây). Báo người chơi thử lại sau. */
    TOO_MANY_REQUESTS = "TOO_MANY_REQUESTS",
    /** Lỗi máy chủ không lường trước (HTTP 500). Hiện thông báo chung kèm mã tham chiếu. */
    INTERNAL_ERROR = "INTERNAL_ERROR",
    /** Room đích không phản hồi / đã đóng (gọi giữa các room quá 3 giây). Thử lại hoặc bỏ qua thao tác. */
    ROOM_UNAVAILABLE = "ROOM_UNAVAILABLE",
}

registerErrorCodes(CommonCode, {
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INVALID_INPUT: 422,
    MISSING_TOKEN: 401,
    INVALID_TOKEN: 401,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_ERROR: 500,
    ROOM_UNAVAILABLE: 503,
});
