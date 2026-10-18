import type { ErrorCode } from "@/core/types/result.type.js";
import type {
    ErrorData,
    Failure,
    Paginated,
    Pagination,
    Result,
    Success,
} from "@/core/types/result.type.js";

/** Type guard thay cho `!result.success` (tsconfig tắt strictNullChecks nên truthiness không thu hẹp kiểu). */
export const isFail = <T>(result: Result<T>): result is Failure => result.success === false;

/** Thành công. Không có dữ liệu thì `data` là `null`. */
export const ok = <T = null>(data: T | null = null, message = "OK"): Success<T | null> => ({
    success: true,
    data,
    code: null,
    message,
    error: null,
});

/** Thành công với danh sách: luôn là `{ items, pagination }`, rỗng thì `items: []`. */
export const okPage = (
    items: unknown[],
    pagination: Pagination,
    message = "OK"
): Success<Paginated<unknown>> => ok({ items, pagination }, message) as Success<Paginated<unknown>>;

/** "ITEM_NOT_FOUND" -> "Item not found" (message mặc định cho dev / log; client dùng `code`). */
const defaultMessage = (code: string) => {
    const text = code.toLowerCase().replaceAll("_", " ");
    return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Thất bại. `code` bắt buộc; `message` mặc định suy ra từ `code`; `error` là dữ liệu kèm theo riêng
 * cho `code` đó (nếu có).
 */
export const fail = <C extends ErrorCode>(
    code: C,
    message: string = defaultMessage(code),
    error: ErrorData | null = null
): Failure<C> => ({ success: false, data: null, code, message, error });
