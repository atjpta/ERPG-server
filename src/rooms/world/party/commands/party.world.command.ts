import { Command } from "@colyseus/command";
import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import { partyWorldService } from "@/rooms/world/party/services/party.world.service.js";
import { PartyDeclineSchema } from "@/rooms/world/content/validators/content.world.validator.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

interface PartyPayload {
    client: PlayerClient;
    payload: unknown;
}

/** Tạo party (hoặc lấy lại party hiện có) và báo client room để join. */
export class PartyCreateWorldCommand extends Command<WorldRoom, PartyPayload> {
    async execute({ client }: PartyPayload) {
        const player = this.room.state.players.get(client.sessionId);
        if (!player || player.hp <= 0) return;
        await partyWorldService.ensureParty(this.room, client, player);
    }
}

export class PartyDeclineWorldCommand extends Command<WorldRoom, PartyPayload> {
    async execute({ client, payload }: PartyPayload) {
        const player = this.room.state.players.get(client.sessionId);
        const parsed = PartyDeclineSchema.safeParse(payload);
        if (!player || !parsed.success) return;
        await partyWorldService.declineInvite(player.id, parsed.data.partyRoomId);
    }
}
