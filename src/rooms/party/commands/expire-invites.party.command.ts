import type { PartyRoom } from "@/rooms/party/party.room.js";
import { PartyNoticeCode } from "@/rooms/party/types/party-message.type.js";
import { Command } from "@colyseus/command";
import { notifyLeader } from "@/rooms/party/services/party-notify.js";

export class ExpireInvitesPartyCommand extends Command<PartyRoom> {
    execute() {
        for (const [, invite] of this.room.state.pruneInvites(this.clock.currentTime)) {
            notifyLeader(this.room, PartyNoticeCode.INVITE_EXPIRED, invite.snapshot.name);
        }
    }
}
