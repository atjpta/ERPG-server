import { registerErrorCodes } from "@/core/utils/error-code.util.js";

/** Mã lỗi riêng của room world. */
export enum WorldErrorCode {
    /** Đối tượng không tương tác được lúc này (đã dùng, chưa đủ điều kiện hiển thị...). */
    INTERACT_NOT_AVAILABLE = "INTERACT_NOT_AVAILABLE",
    /** Server chưa có cấu hình skill để gửi. */
    SKILL_CONFIG_UNAVAILABLE = "SKILL_CONFIG_UNAVAILABLE",
}

registerErrorCodes(WorldErrorCode);
