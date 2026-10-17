import type { Command, Dispatcher } from "@colyseus/command";
import type { Room } from "colyseus";

/**
 * Chạy command rồi lấy kết quả nó ghi vào field `result`. `dispatch()` không trả kết quả nghiệp vụ
 * (giá trị trả về của `execute()` bị coi là command con), nên RPC cần kết quả phải đọc lại từ instance.
 */
export async function dispatchForResult<T, P = undefined>(
    dispatcher: Dispatcher<Room>,
    command: Command<Room, P> & { result: T },
    payload?: P
): Promise<T> {
    await dispatcher.dispatch(command, payload);
    return command.result;
}
