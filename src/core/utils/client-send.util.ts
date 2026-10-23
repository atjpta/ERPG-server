import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { ErrorCode, ErrorData, Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import type { z } from "zod";

type MessageType = string | number;

/** Ném khi payload sai (đã gửi `INVALID_INPUT` cho client); handler của `loadRoomMessages` bắt và dừng command. */
export class PayloadRejected extends Error {}

/** Hàm gửi `Result` (envelope chung với API) xuống đúng client này. Cài vào prototype bởi `extendClientSend`. */
export interface ClientSend {
    sendResult(type: MessageType, result: Result<unknown>): void;
    sendSuccess(type: MessageType, data?: unknown): void;
    sendError(type: MessageType, code: ErrorCode, error?: ErrorData | null): void;
    /**
     * Parse payload client gửi lên trong `validate()` của command. Sai thì gửi `INVALID_INPUT` (kèm `error`
     * nếu có) qua `type` rồi ném `PayloadRejected` để dừng luôn command — không cần `return` ở nơi gọi.
     * Chỉ dùng cho command nhận từ client (đi qua `loadRoomMessages`).
     */
    parsePayload<TSchema extends z.ZodType>(
        schema: TSchema,
        payload: unknown,
        type: MessageType,
        error?: ErrorData | null
    ): z.infer<TSchema>;
}

/**
 * Gắn `sendResult/sendSuccess/sendError` vào class client của transport (Colyseus `Client` chỉ là interface).
 * Gọi một lần lúc khởi động, trước khi có client nào kết nối.
 */
export function extendClientSend(prototype: object) {
    const methods: ClientSend &
        ThisType<ClientSend & { send(type: MessageType, message: unknown): void }> = {
        sendResult(type, result) {
            this.send(type, result);
        },
        sendSuccess(type, data = null) {
            this.send(type, Response.success(data));
        },
        sendError(type, code, error = null) {
            this.send(type, Response.error(code, undefined, error));
        },
        parsePayload(schema, payload, type, error = null) {
            const parsed = schema.safeParse(payload);
            if (parsed.success) return parsed.data;
            this.sendError(type, CommonCode.INVALID_INPUT, error);
            throw new PayloadRejected();
        },
    };
    Object.assign(prototype, methods);
}
