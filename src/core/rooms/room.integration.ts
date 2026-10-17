import { matchMaker, type Room } from "colyseus";

const ROOM_REQUEST_TIMEOUT_MS = 3000;

type RoomMethod = (...args: never[]) => unknown;
/** Tham số / kết quả của một method RPC công khai trên room `T`. */
export type RpcArgs<T, K extends keyof T> = Parameters<Extract<T[K], RoomMethod>>;
export type RpcResult<T, K extends keyof T> = Awaited<ReturnType<Extract<T[K], RoomMethod>>>;
/**
 * Kiểu của remote: mapped type theo `keyof Pick<T, K>` để "Go to Definition" nhảy thẳng tới method
 * trên room; mỗi RPC có thể trả `undefined` khi timeout / room không còn.
 */
export type RoomRemote<T, K extends keyof T> = {
    [P in keyof Pick<T, K>]: (...args: RpcArgs<T, P>) => Promise<RpcResult<T, P> | undefined>;
};

/**
 * Tạo hàm gọi RPC cho room `T`: `call(roomId, "method", args, fallback)`. Kiểu tham số / kết quả suy ra từ
 * method trên `T`; timeout hoặc room không còn thì trả `fallback` (bỏ trống = `undefined`).
 */
export const roomCaller =
    <T>() =>
    <K extends keyof T>(
        roomId: string,
        method: K & string,
        args: RpcArgs<T, K>,
        fallback?: RpcResult<T, K>
    ) =>
        requestRoom<RpcResult<T, K> | undefined>(roomId, method, args, fallback);

/** Bounded request/response; mutations that may be retried carry an idempotency key. */
export async function requestRoom<T>(
    roomId: string,
    method: string,
    args: unknown[],
    fallback: T
): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    try {
        return await Promise.race([
            matchMaker.remoteRoomCall(
                roomId,
                method as keyof Room,
                args,
                ROOM_REQUEST_TIMEOUT_MS
            ) as Promise<T>,
            new Promise<T>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error("Room request timed out")),
                    ROOM_REQUEST_TIMEOUT_MS
                );
            }),
        ]);
    } catch (error) {
        console.warn(`[Rooms] ${method} -> ${roomId} failed:`, error);
        return fallback;
    } finally {
        clearTimeout(timer);
    }
}
