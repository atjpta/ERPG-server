import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { playerPartyWorldService } from "@/rooms/world/modules/players/services/player-party.world.service.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface PartyPayload {
    client: PlayerClient;
    payload: unknown;
}

/** Tạo party (hoặc lấy lại party hiện có) và báo client room để join. */
export class PartyCreateWorldCommand extends Command<WorldRoom, PartyPayload> {
    static readonly message = WorldClientMessage.PARTY_CREATE;

    async execute({ client }: PartyPayload) {
        const player = this.room.state.players.get(client.sessionId);
        if (!player || player.hp <= 0) return;
        await playerPartyWorldService.ensureParty(this.room, player);
    }
}
