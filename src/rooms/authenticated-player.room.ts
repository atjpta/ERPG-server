import type { AuthContext, RoomOptions } from "colyseus";
import { BaseGameRoom } from "@/core/rooms/base-game.room.js";
import type { AuthPlayer } from "@/core/types/auth-player.type.js";
import { playerAuthService } from "@/modules/auth/services/player-auth.service.js";
import { roomRuntimes, type RoomRuntimeService } from "@/rooms/runtime/runtime.room.js";

/**
 * Base chung của các room game cần đăng nhập: verify player token, kiểm tra tài khoản còn chơi được và
 * bảo đảm `options.serverId` (dùng để ghép room) khớp `serverId` trong token — không tin riêng options của client.
 */
export abstract class AuthenticatedPlayerRoom<
    T extends RoomOptions = RoomOptions,
> extends BaseGameRoom<T> {
    static override async onAuth(token: string, options: unknown, _context: AuthContext) {
        const auth = await playerAuthService.verifyToken(token);
        const { serverId, persistent } =
            (options as { serverId?: unknown; persistent?: unknown } | undefined) ?? {};
        // Chỉ server được đặt `persistent` (lúc dựng room sẵn); client gửi lên sẽ tạo room không bao giờ tự đóng.
        if (persistent !== undefined) throw new Error("Invalid room options");
        if (typeof serverId !== "string" || serverId !== auth.serverId) {
            throw new Error("Invalid game server");
        }
        // Process này chỉ phục vụ các game server được ghim (xem `pinGameServers`).
        if (!roomRuntimes.has(serverId)) throw new Error("Invalid game server");
        return auth;
    }

    /** Runtime của game server mà room này thuộc về (dữ liệu người chơi, party, bạn bè và cổng gọi room khác). */
    get runtime(): RoomRuntimeService {
        return roomRuntimes.of(this.serverId);
    }

    /** Người chơi đổi tên giữa phiên: chỉ đổi trong runtime; room nào quan tâm đăng ký `PlayerRuntimeEvent.RENAMED`. */
    protected override onPlayerRenamed(playerId: string, name: string) {
        const runtime = this.runtime.players.get(playerId);
        if (runtime) this.runtime.players.rename(runtime, name);
    }

    protected override assertStillPlayable(auth: AuthPlayer): Promise<void> {
        return playerAuthService.assertStillPlayable(auth);
    }
}
