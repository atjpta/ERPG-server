import { registerErrorCodes } from "@/core/utils/error-code.util.js";

/** Mã lỗi riêng của room world. */
export enum WorldErrorCode {
    INTERACT_NOT_AVAILABLE = "INTERACT_NOT_AVAILABLE",
    SKILL_CONFIG_UNAVAILABLE = "SKILL_CONFIG_UNAVAILABLE",
}

registerErrorCodes(WorldErrorCode);
