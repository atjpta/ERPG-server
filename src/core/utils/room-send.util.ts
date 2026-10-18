import type { ErrorCode } from "@/core/types/result.type.js";
import type { Result } from "@/core/types/result.type.js";
import type { ErrorData } from "@/core/types/result.type.js";
import { fail, ok } from "@/core/utils/result.util.js";
import type { Client, Room } from "colyseus";

type MessageType = string | number;
type BroadcastOptions = Parameters<Room["broadcast"]>[2];

/** Mọi message server gửi xuống client đều là `Result` (envelope chung với API). */
export const sendResult = (
    client: Pick<Client, "send">,
    type: MessageType,
    result: Result<unknown>
) => client.send(type, result);

export const sendOk = (client: Pick<Client, "send">, type: MessageType, data: unknown = null) =>
    sendResult(client, type, ok(data));

export const sendFail = (
    client: Pick<Client, "send">,
    type: MessageType,
    code: ErrorCode,
    error: ErrorData | null = null
) => sendResult(client, type, fail(code, undefined, error));

export const broadcastOk = (
    room: Pick<Room, "broadcast">,
    type: MessageType,
    data: unknown = null,
    options?: BroadcastOptions
) => room.broadcast(type, ok(data), options);

export const broadcastResult = (
    room: Pick<Room, "broadcast">,
    type: MessageType,
    result: Result<unknown>,
    options?: BroadcastOptions
) => room.broadcast(type, result, options);
