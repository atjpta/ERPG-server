import { registerErrorCodes } from "@/core/utils/error-code.util.js";

/** Mã lỗi hội thoại. */
export enum DialogueErrorCode {
    DIALOGUE_CODE_EXISTS = "DIALOGUE_CODE_EXISTS",
    DIALOGUE_INVALID = "DIALOGUE_INVALID",
    DIALOGUE_NOT_FOUND = "DIALOGUE_NOT_FOUND",
}

registerErrorCodes(DialogueErrorCode);
