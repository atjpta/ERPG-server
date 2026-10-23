import type { Client, Room } from "colyseus";
import { errorEnvelope, successEnvelope, toEnvelope } from "@/core/response/envelope.js";
import { Response } from "@/core/response/response.js";
import type { Response as ResponseOf } from "@/core/response/response.type.js";
import type { ErrorCode, ErrorData, Result } from "@/core/response/result.type.js";

type MessageType = string | number;
type BroadcastOptions = Parameters<Room["broadcast"]>[2];

/**
 * Lớp trả lời của room: đổi `Response` nội bộ thành envelope `Result` — cùng định dạng với API.
 * - Reply cho Request/Response: command gán `this.result = Response...`, `loadRoomMessages` gọi `reply`.
 * - Push chủ động (`*Message`): `send` một client, `broadcast` cả room; thất bại chủ động: `sendError`.
 */
export const RoomResponse = {
    /** Envelope trả cho client của một request; không có `response` thì thành công rỗng. */
    reply(response?: ResponseOf<unknown>): Result<unknown> {
        return toEnvelope(response ?? Response.success());
    },

    /** Đẩy dữ liệu xuống một client. */
    send(client: Pick<Client, "send">, type: MessageType, data: unknown = null): void {
        client.send(type, successEnvelope(data));
    },

    /** Đẩy một lỗi chủ động xuống một client (vd lệnh bị từ chối ngoài luồng request). */
    sendError(
        client: Pick<Client, "send">,
        type: MessageType,
        code: ErrorCode,
        errorData?: ErrorData
    ): void {
        client.send(type, errorEnvelope(code, errorData ?? null));
    },

    /** Đẩy dữ liệu xuống mọi client trong room. */
    broadcast(
        room: Pick<Room, "broadcast">,
        type: MessageType,
        data: unknown = null,
        options?: BroadcastOptions
    ): void {
        room.broadcast(type, successEnvelope(data), options);
    },
};
