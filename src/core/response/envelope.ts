import type { Response } from "@/core/response/response.type.js";
import type {
    ErrorCode,
    ErrorData,
    ErrorResult,
    Result,
    Success,
} from "@/core/response/result.type.js";

/** "ITEM_NOT_FOUND" -> "Item not found" (message mặc định cho dev / log; client dùng `code`). */
export const defaultMessage = (code: string): string => {
    const text = code.toLowerCase().replaceAll("_", " ");
    return text.charAt(0).toUpperCase() + text.slice(1);
};

export const successEnvelope = <T>(data: T = null as T, message = "OK"): Success<T> => ({
    success: true,
    data,
    code: null,
    message,
    error: null,
});

export const errorEnvelope = <C extends ErrorCode>(
    code: C,
    errorData: ErrorData | null = null,
    message: string = defaultMessage(code)
): ErrorResult<C> => ({ success: false, data: null, code, message, error: errorData });

/**
 * Chỗ DUY NHẤT dựng envelope gửi client (API, reply / push của room): mọi `Response` nội bộ đi qua đây nên
 * định dạng luôn giống nhau.
 */
export const toEnvelope = <T>(response: Response<T>): Result<T> =>
    response.success === true
        ? successEnvelope(response.data)
        : errorEnvelope(response.errorCode, response.errorData ?? null);
