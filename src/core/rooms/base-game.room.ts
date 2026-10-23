import { BasePlayerRoom, type PlayerClient } from "@/core/rooms/base-player.room.js";
import { Dispatcher } from "@colyseus/command";
import type { RoomOptions } from "colyseus";

/** Options tối thiểu mọi game room nhận khi tạo: room luôn thuộc đúng một game server. */
export interface GameRoomOptions {
    serverId: string;
}

/**
 * Khung chung của mọi room game (`world`, `global`, ...): mỗi room thuộc một `serverId`, xử lý logic bằng
 * command qua `dispatcher`, và theo dõi `playerId → sessionId` của kết nối đang giữ nhân vật.
 *
 * Room con chỉ viết phần riêng:
 * - `messages = messages` (kết quả `await loadRoomMessages(...)` ở module scope) để tự đăng ký command;
 * - `onCreate` gọi `bindServer(options)`, rồi dispatch command khởi tạo của mình;
 * - `readonly runRpc = createRpcRunner(this, [...])` nếu cho room khác gọi (`callRoom`).
 */
export abstract class BaseGameRoom<T extends RoomOptions = RoomOptions> extends BasePlayerRoom<T> {
    readonly dispatcher = new Dispatcher(this);

    /** Game server mà room thuộc về (từ options lúc tạo; `onAuth` đã bảo đảm khớp token của mọi client). */
    serverId = "";

    /** playerId → sessionId của kết nối đang giữ nhân vật (mỗi player một kết nối trong một room). */
    readonly sessionOf = new Map<string, string>();

    protected bindServer(options: GameRoomOptions) {
        this.serverId = options.serverId;
    }

    clientOf(playerId: string): PlayerClient | undefined {
        const sessionId = this.sessionOf.get(playerId);
        return sessionId
            ? (this.clients.getById(sessionId) as unknown as PlayerClient | undefined)
            : undefined;
    }

    onDispose(): void | Promise<void> {
        this.dispatcher.stop();
    }
}
