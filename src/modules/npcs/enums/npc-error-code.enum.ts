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
    /**
     * Chức năng này chỉ dùng được khi đang mở nó ở NPC (nói chuyện với NPC rồi chọn chức năng, `npcFunctionOpen`) và còn đứng gần NPC.
     * Chưa mở, đã đi xa, hoặc đang ở map khác thì trả mã này; client nên đóng màn hình chức năng.
     */
    NPC_FUNCTION_NOT_OPEN = "NPC_FUNCTION_NOT_OPEN",
}

registerErrorCodes(NpcErrorCode);
