import { registerErrorCodes } from "@/core/response/error-code.js";

/** Mã lỗi riêng của gift code (global room). Quá nhiều lần thử dùng `CommonCode.TOO_MANY_REQUESTS`. */
export enum GiftCodeErrorCode {
    /** Mã không tồn tại, đã bị tắt hoặc không dùng được ở game server này (gộp chung để không lộ mã nào có thật). */
    GIFT_CODE_NOT_FOUND = "GIFT_CODE_NOT_FOUND",
    /** Mã chưa đến giờ bắt đầu. */
    GIFT_CODE_NOT_STARTED = "GIFT_CODE_NOT_STARTED",
    /** Mã đã hết hạn. */
    GIFT_CODE_EXPIRED = "GIFT_CODE_EXPIRED",
    /** Nhân vật này đã nhập mã này rồi. */
    GIFT_CODE_ALREADY_REDEEMED = "GIFT_CODE_ALREADY_REDEEMED",
    /** Mã đã hết lượt dùng. */
    GIFT_CODE_EXHAUSTED = "GIFT_CODE_EXHAUSTED",
}

registerErrorCodes(GiftCodeErrorCode);
