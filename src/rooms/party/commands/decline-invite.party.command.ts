import type { PartyRoom } from "@/rooms/party/party.room.js";
import { notifyLeader } from "@/rooms/party/services/party-notify.js";
import { PartyNoticeCode } from "@/rooms/party/types/party-message.type.js";
import { Command } from "@colyseus/command";

/** RPC từ world: người được mời từ chối, báo cho chủ. */
export class DeclineInvitePartyCommand extends Command<PartyRoom, { playerId: string }> {
    execute({ playerId }: { playerId: string }) {
        const invite = this.room.state.removeInvite(playerId);
        if (invite) notifyLeader(this.room, PartyNoticeCode.INVITE_DECLINED, invite.snapshot.name);
    }
}
