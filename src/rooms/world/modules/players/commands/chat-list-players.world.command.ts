import { ok } from "@/core/utils/result.util.js";
import type { Result } from "@/core/types/result.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

/** RPC từ chat room (kênh general): danh sách `playerId` đang ở world room này. */
export class ChatListPlayersWorldCommand extends Command<WorldRoom, Record<string, never>> {
    result: Result<{ playerIds: string[] }> = ok({ playerIds: [] });

    execute() {
        this.result = ok({ playerIds: [...this.room.state.players.keys()] });
    }
}
