import { ZodError } from "zod";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type {
    Response as ResponseOf,
    ResponseError,
    ResponseSuccess,
} from "@/core/response/response.type.js";
import type { ErrorCode, ErrorData } from "@/core/response/result.type.js";

/** Dừng luồng nhiều bước (kể cả trong `withTransaction` để rollback) với mã nghiệp vụ; `Response.attempt` bắt lại. */
export class ResponseAbort extends Error {
    constructor(
        readonly errorCode: ErrorCode,
        readonly errorData?: ErrorData
    ) {
        super(errorCode);
    }
}

/**
 * Kết quả nội bộ của service / state / manager / cổng giữa room (xem `ResponseOf`): `Response.success(data)`,
 * `Response.error(code)`. Tạo envelope gửi client là việc của `HttpResponse` / `RoomResponse`.
 */
export const Response = {
    /** Thành công. Không có dữ liệu thì `data` là `null`. */
    success: <T = null>(data: T = null as T): ResponseSuccess<T> => ({ success: true, data }),

    /** Thất bại với mã nghiệp vụ (enum theo domain, vd `AuthErrorCode`) và dữ liệu kèm theo (nếu có). */
    error: <C extends ErrorCode>(code: C, errorData?: ErrorData | null): ResponseError<C> =>
        errorData
            ? { success: false, errorCode: code, errorData }
            : { success: false, errorCode: code },

    /** Type guard thay cho `!result.success` (tsconfig tắt strictNullChecks nên truthiness không thu hẹp kiểu). */
    isError: <T>(response: ResponseOf<T>): response is ResponseError => response.success === false,

    /** Đổi dữ liệu của kết quả thành công; thất bại giữ nguyên. */
    map: <T, U>(response: ResponseOf<T>, fn: (data: T) => U): ResponseOf<U> =>
        response.success === true ? Response.success(fn(response.data)) : response,

    /** Dừng luồng nhiều bước; luôn được `Response.attempt` ở hàm công khai bắt lại thành `Response.error`. */
    abort: (code: ErrorCode, errorData?: ErrorData): never => {
        throw new ResponseAbort(code, errorData);
    },

    /** Chạy `task`; `Response.abort(...)` bên trong thành `Response.error`, lỗi khác ném tiếp. */
    attempt: async <T>(task: () => Promise<T>): Promise<ResponseOf<T>> => {
        try {
            return Response.success(await task());
        } catch (e) {
            if (e instanceof ResponseAbort) return Response.error(e.errorCode, e.errorData);
            throw e;
        }
    },

    /**
     * Chỗ DUY NHẤT đổi lỗi bị ném thành `Response` (biên: command của room, rpc, `RouterContainer`):
     * `ResponseAbort` giữ mã nghiệp vụ, `ZodError` thành `INVALID_INPUT` kèm `issues`,
     * lỗi lạ được log và thành `INTERNAL_ERROR` (không lộ chi tiết).
     */
    fromThrown: (error: unknown): ResponseError => {
        if (error instanceof ResponseAbort) return Response.error(error.errorCode, error.errorData);
        if (error instanceof ZodError) {
            return Response.error(CommonCode.INVALID_INPUT, {
                issues: error.issues.map(({ path, message }) => ({ path, message })),
            });
        }
        console.error("[Response] Unhandled error:", error);
        return Response.error(CommonCode.INTERNAL_ERROR);
    },
};

export type Response<T = null> = ResponseOf<T>;
