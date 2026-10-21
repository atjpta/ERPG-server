import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { playerPartyWorldService } from "@/rooms/world/modules/players/services/player-party.world.service.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import { PlayerWorldCommand } from "@/rooms/world/commands/player.world.command.js";

interface PartyPayload {
    client: PlayerClient;
    payload: unknown;
}

/** Tạo party (hoặc lấy lại party hiện có) và báo client room để join. */
@SdkMessage({
    replies: [WorldMessage.PARTY],
    note: "Đang chết (hp ≤ 0) thì server im lặng.",
})
export class PartyCreateWorldCommand extends PlayerWorldCommand<PartyPayload> {
    static readonly message = WorldClientMessage.PARTY_CREATE;

    validate() {
        return this.player.hp > 0;
    }

    async execute() {
        await playerPartyWorldService.ensureParty(this.room, this.player);
    }
}
