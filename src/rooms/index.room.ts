import { defineRoom, type AuthContext, type RoomOptions } from "colyseus";
import { BasePlayerRoom } from "@/core/rooms/base-player.room.js";
import type { AuthPlayer } from "@/core/types/auth-player.type.js";
import { playerAuthService } from "@/modules/auth/services/player-auth.service.js";
import { WorldRoom } from "@/rooms/world/world.room.js";
import { PartyRoom } from "@/rooms/party/party.room.js";

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

export const createRooms = () => {
    return {
        world: defineRoom(WorldRoom).filterBy(["mapCode"]),
        // Mỗi lượt dungeon là 1 instance riêng (`instanceId` do server cấp qua `mapChange`).
        dungeon: defineRoom(WorldRoom).filterBy(["instanceId"]),
        // Mỗi party là một room riêng, tạo từ server (`matchMaker.createRoom`) và vào bằng `joinById`.
        party: defineRoom(PartyRoom),
    };
};
