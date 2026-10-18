import { registerErrorCodes } from "@/core/utils/error-code.util.js";

/** Mã lỗi master data / phiên bản client. */
export enum MasterDataErrorCode {
    CLIENT_OUTDATED = "CLIENT_OUTDATED",
    CLIENT_PLATFORM_DISABLED = "CLIENT_PLATFORM_DISABLED",
    MASTER_DATA_NOT_FOUND = "MASTER_DATA_NOT_FOUND",
    MASTER_DATA_READ_ONLY = "MASTER_DATA_READ_ONLY",
}

registerErrorCodes(MasterDataErrorCode);
