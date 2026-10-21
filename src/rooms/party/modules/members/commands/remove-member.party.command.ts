import { ok } from "@/core/utils/result.util.js";
import type { Result } from "@/core/types/result.type.js";
import { RemovePlayerPartyCommand } from "@/rooms/party/modules/members/commands/remove-player.party.command.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { PartyNotice } from "@/rooms/party/types/party-message.type.js";
import { Command } from "@colyseus/command";

/** RPC từ world: người chơi offline thật (không phải đổi map) thì ra khỏi party ngay. */
export class RemoveMemberPartyCommand extends Command<
    PartyRoom,
    { playerId: string; worldRoomId: string }
> {
    result: Result = ok();

    validate({ playerId, worldRoomId }: { playerId: string; worldRoomId: string }) {
        return this.room.worldRoomOf.get(playerId) === worldRoomId;
    }

    execute({ playerId }: { playerId: string; worldRoomId: string }) {
        return new RemovePlayerPartyCommand().setPayload({
            playerId,
            code: PartyNotice.MEMBER_LEFT,
        });
    }
}
