/**
 * Mã lỗi gửi cho client — unique toàn project. Mỗi domain khai báo enum riêng (`CommonCode`, `AuthErrorCode`,
 * `PartyErrorCode`...) và đăng ký bằng `registerErrorCodes`; core chỉ cần biết đó là chuỗi.
 */
export type ErrorCode = string;

/** Dữ liệu kèm theo lỗi, riêng cho từng `code` (client chỉ đọc khi cần). */
export type ErrorData = Record<string, unknown>;

export interface Pagination {
    total: number;
    page: number;
    limit: number;
}

/** `data` của mọi endpoint trả danh sách. */
export interface Paginated<T> {
    items: T[];
    pagination: Pagination;
}

/**
 * Envelope chung cho API, reply / sự kiện của room và RPC giữa các room. Luôn đủ 5 field:
 * - thành công: `data` là `T` (không có dữ liệu thì `null`), `code` và `error` là `null`;
 * - thất bại: `data` là `null`, `code` là một giá trị của `ErrorCode`, `error` tuỳ `code` (hoặc `null`).
 */
export interface Success<T> {
    success: true;
    data: T;
    code: null;
    message: string;
    error: null;
}

export interface Failure<C extends ErrorCode = ErrorCode> {
    success: false;
    data: null;
    code: C;
    message: string;
    error: ErrorData | null;
}

export type Result<T = null> = Success<T> | Failure;
