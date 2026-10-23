import { matchMaker } from "colyseus";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { Response } from "@/core/response/response.js";
import type { DungeonLaunchRequest } from "@/modules/maps/types/dungeon-launch.type.js";
import type { WorldRoomPort } from "@/modules/maps/types/world-room-port.type.js";

/** Lời gọi giữa các room: room đích xử lý ở `rpc(method, payload)` (xem `RoomRpcHandlers`). */
export type RoomRpcHandlers = Record<string, (payload: never) => Promise<Response<unknown>>>;

/**
 * Gọi một hàm của room khác theo `roomId` — cùng process thì chạy thẳng, khác process đi qua IPC của Colyseus
 * (`matchMaker.remoteRoomCall`, cần Redis presence). `payload` và kết quả phải là JSON. Room đích không còn / không
 * trả lời đúng hạn → `ROOM_UNAVAILABLE`.
 */
export async function callRoom<T = null>(
    roomId: string,
    method: string,
    payload: unknown
): Promise<Response<T>> {
    try {
        return (await matchMaker.remoteRoomCall(roomId, "rpc", [method, payload])) as Response<T>;
    } catch (error) {
        console.warn(`[RoomBus] ${method} -> ${roomId} failed:`, (error as Error).message);
        return Response.error(CommonCode.ROOM_UNAVAILABLE);
    }
}

/** Phía nhận: chạy handler đã khai báo cho `method`, chưa khai báo → `NOT_FOUND`. */
export async function dispatchRpc(
    handlers: RoomRpcHandlers,
    method: string,
    payload: unknown
): Promise<Response<unknown>> {
    const handler = handlers[method];
    if (!handler) return Response.error(CommonCode.NOT_FOUND);
    try {
        return await handler(payload as never);
    } catch (error) {
        return Response.fromThrown(error);
    }
}

/** Global room của game server `serverId` điều phối cả party vào dungeon (roomId của global room là `serverId`). */
export const launchDungeon = (serverId: string, request: DungeonLaunchRequest) =>
    callRoom(serverId, "launchDungeon", request);

/** World room `worldRoomId` kiểm tra `playerId` (đang ở room đó) có vào được dungeon không. */
export const checkDungeonEntry = (
    worldRoomId: string,
    request: Parameters<WorldRoomPort["checkDungeonEntry"]>[0]
) => callRoom(worldRoomId, "checkDungeonEntry", request);

/** World room `worldRoomId` đưa `playerId` vào instance dungeon. */
export const enterDungeon = (
    worldRoomId: string,
    request: Parameters<WorldRoomPort["enterDungeon"]>[0]
) => callRoom(worldRoomId, "enterDungeon", request);
