import { registerErrorCodes } from "@/core/utils/error-code.util.js";

/** Mã lỗi master data / phiên bản client. */
export enum MasterDataErrorCode {
    /** Bản client quá cũ — bắt buộc cập nhật. `error` mang thông tin phiên bản tối thiểu. */
    CLIENT_OUTDATED = "CLIENT_OUTDATED",
    /** Nền tảng này đang tạm tắt (bảo trì). */
    CLIENT_PLATFORM_DISABLED = "CLIENT_PLATFORM_DISABLED",
    /** Không có cấu hình master data này (admin). */
    MASTER_DATA_NOT_FOUND = "MASTER_DATA_NOT_FOUND",
    /** Cấu hình master data này chỉ đọc (admin). */
    MASTER_DATA_READ_ONLY = "MASTER_DATA_READ_ONLY",
}

registerErrorCodes(MasterDataErrorCode);
