import type { Response } from "@/core/response/response.js";

/** Kết quả một thao tác túi đồ: dữ liệu hoặc mã lỗi nghiệp vụ. */
export type InventoryResult<T = null> = Response<T>;
