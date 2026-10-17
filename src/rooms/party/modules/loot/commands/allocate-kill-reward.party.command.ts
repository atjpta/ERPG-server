import type { PartyRoom } from "@/rooms/party/party.room.js";
import type { KillRewardRequest, KillRewardShare } from "@/rooms/party/types/party-room.type.js";
import { Command } from "@colyseus/command";

/** RPC từ world: chia thưởng hạ quái; gửi lại cùng `eventId` thì trả đúng bản chia cũ. */
export class AllocateKillRewardPartyCommand extends Command<PartyRoom, KillRewardRequest> {
    result: KillRewardShare[] | null = null;

    execute(request: KillRewardRequest) {
        this.result = this.room.loot.allocate(this.room.state, request);
    }
}
