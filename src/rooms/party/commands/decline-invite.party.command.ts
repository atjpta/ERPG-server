import { ok } from "@/core/utils/result.util.js";
import type { Result } from "@/core/types/result.type.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { notifyLeader } from "@/rooms/party/services/party-notify.js";
import { PartyNotice } from "@/rooms/party/types/party-message.type.js";
import { Command } from "@colyseus/command";

/** RPC từ world: người được mời từ chối, báo cho chủ. */
export class DeclineInvitePartyCommand extends Command<PartyRoom, { playerId: string }> {
    result: Result = ok();

    execute({ playerId }: { playerId: string }) {
        const invite = this.room.state.removeInvite(playerId);
        if (invite) notifyLeader(this.room, PartyNotice.INVITE_DECLINED, invite.snapshot.name);
    }
}
