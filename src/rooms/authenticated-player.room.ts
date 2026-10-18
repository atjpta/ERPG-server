import type { AuthContext, RoomOptions } from "colyseus";
import { BasePlayerRoom } from "@/core/rooms/base-player.room.js";
import type { AuthPlayer } from "@/core/types/auth-player.type.js";
import { playerAuthService } from "@/modules/auth/services/player-auth.service.js";

/** Base chung của các room cần đăng nhập: verify player token và kiểm tra tài khoản còn chơi được. */
export abstract class AuthenticatedPlayerRoom<
    T extends RoomOptions = RoomOptions,
> extends BasePlayerRoom<T> {
    static override async onAuth(token: string, _options: unknown, _context: AuthContext) {
        return playerAuthService.verifyToken(token);
    }

    protected override assertStillPlayable(auth: AuthPlayer): Promise<void> {
        return playerAuthService.assertStillPlayable(auth);
    }
}
