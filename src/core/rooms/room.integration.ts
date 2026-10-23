import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import { dispatchForResult } from "@/core/utils/dispatch-result.util.js";
import type { Command, Dispatcher } from "@colyseus/command";
import { matchMaker, type Room } from "colyseus";

const ROOM_REQUEST_TIMEOUT_MS = 3000;

/** Tuỳ chọn của một lời gọi giữa các room. */
export interface RoomCallOptions {
    /** Thời gian chờ tối đa (ms); mặc định 3000. Tăng cho RPC gộp nhiều bước (vd kiểm tra + vào dungeon). */
    timeoutMs?: number;
}

/** Command RPC: nhận một object payload `P`, ghi `Result<T>` vào `result`. */
export type RpcCommandClass<P = any, T = any> = new () => Command<any, P> & { result: Result<T> };

/** Tên method RPC duy nhất trên room (xem `createRpcRunner`). */
const RPC_METHOD = "runRpc";

/**
 * Gọi một command RPC của room khác theo room id: `callRoom(globalRoomId, LaunchDungeonGlobalCommand, payload)`.
 * Kiểu payload / kết quả suy ra từ chính class command, và click vào tên class nhảy thẳng tới command.
 * Timeout (mặc định 3s, đổi bằng `{ timeoutMs }`) hoặc room không còn thì trả `fail(CommonCode.ROOM_UNAVAILABLE)`.
 */
export function callRoom<P, T>(
    roomId: string,
    CommandClass: RpcCommandClass<P, T>,
    payload: P,
    options: RoomCallOptions = {}
): Promise<Result<T>> {
    return requestRoom<Result<T>>(
        roomId,
        RPC_METHOD,
        [CommandClass.name, payload],
        Response.error(CommonCode.ROOM_UNAVAILABLE),
        options
    );
}

/**
 * Phía room nhận RPC: `readonly runRpc = createRpcRunner(this, [AttachWorldGlobalCommand, ...])`. Chỉ command
 * trong danh sách mới chạy được (tra theo tên class); tên lạ trả `fail(NOT_FOUND)`.
 */
export function createRpcRunner(
    room: { dispatcher: Dispatcher<any> },
    commands: readonly RpcCommandClass[]
) {
    const byName = new Map(commands.map((CommandClass) => [CommandClass.name, CommandClass]));
    return async (name: string, payload: unknown): Promise<Result<unknown>> => {
        const CommandClass = byName.get(name);
        if (!CommandClass) return Response.error(CommonCode.NOT_FOUND, `Unknown RPC "${name}"`);
        return dispatchForResult(room.dispatcher, new CommandClass(), payload);
    };
}

/** Bounded request/response; mutations that may be retried carry an idempotency key. */
export async function requestRoom<T>(
    roomId: string,
    method: string,
    args: unknown[],
    fallback: T,
    { timeoutMs = ROOM_REQUEST_TIMEOUT_MS }: RoomCallOptions = {}
): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    try {
        return await Promise.race([
            matchMaker.remoteRoomCall(roomId, method as keyof Room, args, timeoutMs) as Promise<T>,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => reject(new Error("Room request timed out")), timeoutMs);
            }),
        ]);
    } catch (error) {
        console.warn(`[Rooms] ${method} -> ${roomId} failed:`, error);
        return fallback;
    } finally {
        clearTimeout(timer);
    }
}
