import { registerErrorCodes } from "@/core/utils/error-code.util.js";

/** Mã lỗi hội thoại. */
export enum DialogueErrorCode {
    /** Mã hội thoại đã tồn tại (admin). */
    DIALOGUE_CODE_EXISTS = "DIALOGUE_CODE_EXISTS",
    /** Đồ thị hội thoại không hợp lệ (admin). */
    DIALOGUE_INVALID = "DIALOGUE_INVALID",
    /** Không có hội thoại phù hợp (không có lời thoại cho NPC / node không tồn tại). */
    DIALOGUE_NOT_FOUND = "DIALOGUE_NOT_FOUND",
}

registerErrorCodes(DialogueErrorCode);
