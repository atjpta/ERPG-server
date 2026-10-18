import type { ZodType } from "zod";

/** Một message client → server, đã ghép phần tự suy (payload) với `@SdkMessage` (tài liệu). */
export interface ClientMessageContract {
    /** Payload client gửi (Zod schema, sinh class C#); `null` nếu không có. */
    payload: ZodType | null;
    /** Message server dùng để trả lời (value của enum server message). */
    replies: readonly string[];
    /** Mã lỗi nghiệp vụ có thể trả trong `replies`. */
    errors: readonly string[];
    note: string;
    /** Có khai báo `@SdkMessage` hay không (không có thì doc chỉ nêu payload). */
    documented: boolean;
}

/** Một message server → client. */
export interface ServerMessageContract {
    /** Tên DTO `...Message` của `data`, `"string"`, hoặc `null` nếu không có dữ liệu. */
    data: string | null;
}

/** Contract client của một room — suy từ code + decorator. */
export interface RoomContract {
    /** Tên thư mục + tiền tố class C# (`World` → `WorldRoomClient`). */
    name: string;
    /** Class state Colyseus Schema. */
    state: string;
    /** Tên enum message client / server và file chứa chúng. */
    enums: { client: string; server: string; file: string };
    joins: readonly { room: string; options: ZodType | null; doc: string }[];
    client: Record<string, ClientMessageContract>;
    server: Record<string, ServerMessageContract>;
}
