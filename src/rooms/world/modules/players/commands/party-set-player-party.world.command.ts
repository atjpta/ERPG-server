import type { PartyMembershipEvent } from "@/rooms/party/party.shared.js";
import { playerPartyWorldService } from "@/rooms/world/modules/players/services/player-party.world.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

/** RPC từ party: thành viên vào / rời party hoặc đổi cách chia loot. Bản cũ / trùng bị bỏ qua. */
export class PartySetPlayerPartyWorldCommand extends Command<WorldRoom, PartyMembershipEvent> {
    async execute(event: PartyMembershipEvent) {
        await playerPartyWorldService.setPlayerParty(this.room, event);
    }
}
