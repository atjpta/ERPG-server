import { registerErrorCodes } from "@/core/utils/error-code.util.js";

/** Mã lỗi chung (core): dùng được ở mọi tầng. */
export enum CommonCode {
    BAD_REQUEST = "BAD_REQUEST",
    UNAUTHORIZED = "UNAUTHORIZED",
    FORBIDDEN = "FORBIDDEN",
    NOT_FOUND = "NOT_FOUND",
    CONFLICT = "CONFLICT",
    INVALID_INPUT = "INVALID_INPUT",
    MISSING_TOKEN = "MISSING_TOKEN",
    INVALID_TOKEN = "INVALID_TOKEN",
    TOO_MANY_REQUESTS = "TOO_MANY_REQUESTS",
    INTERNAL_ERROR = "INTERNAL_ERROR",
    ROOM_UNAVAILABLE = "ROOM_UNAVAILABLE",
}

registerErrorCodes(CommonCode);
