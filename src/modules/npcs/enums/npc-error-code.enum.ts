import { registerErrorCodes } from "@/core/response/error-code.js";

/** Mã lỗi NPC. */
export enum NpcErrorCode {
    /** Mã NPC đã tồn tại (admin). */
    NPC_CODE_EXISTS = "NPC_CODE_EXISTS",
    /** NPC không tồn tại. */
    NPC_NOT_FOUND = "NPC_NOT_FOUND",
    /** NPC không đứng trong map hiện tại. */
    NPC_NOT_IN_MAP = "NPC_NOT_IN_MAP",
    /** NPC không có chức năng này. */
    NPC_FUNCTION_NOT_FOUND = "NPC_FUNCTION_NOT_FOUND",
}

registerErrorCodes(NpcErrorCode);
