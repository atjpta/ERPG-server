import type { AuthContext, RoomOptions } from "colyseus";
import { BaseGameRoom } from "@/core/rooms/base-game.room.js";
import type { AuthPlayer } from "@/core/types/auth-player.type.js";
import { playerAuthService } from "@/modules/auth/services/player-auth.service.js";

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
        return auth;
    }

    protected override assertStillPlayable(auth: AuthPlayer): Promise<void> {
        return playerAuthService.assertStillPlayable(auth);
    }
}
