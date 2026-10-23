import type { ErrorCode, ErrorData } from "@/core/response/result.type.js";

/** Kết quả thành công của hàm service / state / manager / cổng giữa room. */
export interface ResponseSuccess<T> {
    success: true;
    data: T;
}

/** Kết quả thất bại: mã nghiệp vụ (enum theo domain) + dữ liệu kèm theo riêng cho mã đó (nếu có). */
export interface ResponseError<C extends ErrorCode = ErrorCode> {
    success: false;
    errorCode: C;
    errorData?: ErrorData;
}

/**
 * Kiểu trả về nội bộ duy nhất cho mọi hàm có thể thất bại vì nghiệp vụ (service, state, manager, rpc giữa room).
 * Là object JSON thuần nên đi qua `remoteRoomCall` được. Không trả thẳng client: `HttpResponse` (API) và
 * `RoomResponse` (room) đổi nó sang envelope `Result`.
 */
export type Response<T = null> = ResponseSuccess<T> | ResponseError;
