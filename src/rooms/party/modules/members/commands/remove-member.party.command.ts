import { RemovePlayerPartyCommand } from "@/rooms/party/modules/members/commands/remove-player.party.command.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { PartyNoticeCode } from "@/rooms/party/types/party-message.type.js";
import { Command } from "@colyseus/command";

/** RPC từ world: người chơi offline thật (không phải đổi map) thì ra khỏi party ngay. */
export class RemoveMemberPartyCommand extends Command<
    PartyRoom,
    { playerId: string; worldRoomId: string }
> {
    execute({ playerId, worldRoomId }: { playerId: string; worldRoomId: string }) {
        if (this.room.worldRoomOf.get(playerId) !== worldRoomId) return;
        return new RemovePlayerPartyCommand().setPayload({
            playerId,
            code: PartyNoticeCode.MEMBER_LEFT,
        });
    }
}
