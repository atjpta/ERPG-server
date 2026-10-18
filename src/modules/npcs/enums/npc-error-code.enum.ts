import { registerErrorCodes } from "@/core/utils/error-code.util.js";

/** Mã lỗi NPC. */
export enum NpcErrorCode {
    NPC_CODE_EXISTS = "NPC_CODE_EXISTS",
    NPC_NOT_FOUND = "NPC_NOT_FOUND",
    NPC_NOT_IN_MAP = "NPC_NOT_IN_MAP",
    NPC_FUNCTION_NOT_FOUND = "NPC_FUNCTION_NOT_FOUND",
}

registerErrorCodes(NpcErrorCode);
