import { PartyErrorCode } from "@/rooms/party/types/party-error-code.type.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { Result } from "@/core/types/result.type.js";
import { fail, ok } from "@/core/utils/result.util.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import type { KillRewardRequest, KillRewardShare } from "@/rooms/party/types/party-room.type.js";
import { Command } from "@colyseus/command";

/** RPC từ world: chia thưởng hạ quái; gửi lại cùng `eventId` thì trả đúng bản chia cũ. */
export class AllocateKillRewardPartyCommand extends Command<PartyRoom, KillRewardRequest> {
    result: Result<KillRewardShare[]> = fail(CommonCode.ROOM_UNAVAILABLE);

    execute(request: KillRewardRequest) {
        const shares = this.room.loot.allocate(this.room.state, request);
        this.result = shares ? ok(shares) : fail(PartyErrorCode.PARTY_NOT_MEMBER);
    }
}
