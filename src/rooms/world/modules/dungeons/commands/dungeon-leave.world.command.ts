import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { dungeonWorldService } from "@/rooms/world/modules/dungeons/services/dungeon.world.service.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

export class DungeonLeaveWorldCommand extends Command<WorldRoom, { client: PlayerClient }> {
    static readonly message = WorldClientMessage.DUNGEON_LEAVE;

    async execute({ client }: { client: PlayerClient }) {
        if (this.room.isDungeon) await this.leaveByClient(this.room, client);
    }

    /** Client chủ động rời dungeon. */
    private async leaveByClient(room: WorldRoom, client: PlayerClient): Promise<void> {
        const player = room.state.players.get(client.sessionId);
        if (player) await dungeonWorldService.leave(room, client, player, "return");
    }
}
