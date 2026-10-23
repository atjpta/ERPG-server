import type { Result } from "@/core/types/result.type.js";

/** Kết quả một thao tác túi đồ: dữ liệu hoặc `ErrorCode` lỗi. */
export type InventoryResult<T = null> = Result<T>;
