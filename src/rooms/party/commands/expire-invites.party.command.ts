import type { PartyRoom } from "@/rooms/party/party.room.js";
import { PartyNotice } from "@/rooms/party/types/party-message.type.js";
import { Command } from "@colyseus/command";
import { notifyLeader } from "@/rooms/party/services/party-notify.js";

export class ExpireInvitesPartyCommand extends Command<PartyRoom> {
    execute() {
        for (const [, invite] of this.room.state.pruneInvites(this.clock.currentTime)) {
            notifyLeader(this.room, PartyNotice.INVITE_EXPIRED, invite.snapshot.name);
        }
    }
}
