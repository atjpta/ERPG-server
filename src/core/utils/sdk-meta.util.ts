import type { ZodType } from "zod";

/** Ai gọi được endpoint: không cần token, user token (tài khoản) hoặc player token (nhân vật). */
export type SdkAuth = "none" | "user" | "player";

/**
 * Hợp đồng client của endpoint, khai báo ở option `sdk` của endpoint: `{ method: "GET", sdk: {...} }`.
 * Bộ export (`yarn unity:network`) đọc để sinh hàm C# có kiểu và tài liệu.
 */
export interface SdkEndpointMeta {
    /** Một câu mô tả hàm client (ra XML doc). */
    summary: string;
    auth: SdkAuth;
    /**
     * Kiểu `data` khi thành công: Zod schema (sinh class C#), `null` nếu không có dữ liệu, hoặc `"raw"`
     * khi chưa khai báo kiểu (client nhận JSON thô — export in cảnh báo).
     */
    response: ZodType | null | "raw";
    /** Mã lỗi nghiệp vụ endpoint này có thể trả (mã chung như INVALID_INPUT được thêm tự động). */
    errors?: readonly string[];
    /** Không xuất cho client (endpoint nội bộ / trang HTML). */
    hidden?: boolean;
}
