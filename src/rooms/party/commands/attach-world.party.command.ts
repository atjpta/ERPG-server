import { PartyErrorCode } from "@/rooms/party/types/party-error-code.type.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { Result } from "@/core/types/result.type.js";
import { fail, ok } from "@/core/utils/result.util.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import type { PartyMemberInfo } from "@/rooms/party/schemas/party.schema.js";
import type { PartySnapshot } from "@/rooms/party/types/party-room.type.js";
import { Command } from "@colyseus/command";

interface Payload {
    playerId: string;
    worldRoomId: string;
    info?: Partial<PartyMemberInfo>;
}

/** RPC từ world: world room mới báo thành viên đã vào (đổi map / vào dungeon). */
export class AttachWorldPartyCommand extends Command<PartyRoom, Payload> {
    result: Result<PartySnapshot> = fail(CommonCode.ROOM_UNAVAILABLE);

    validate({ playerId }: Payload) {
        if (this.room.state.has(playerId)) return true;
        this.result = fail(PartyErrorCode.PARTY_NOT_MEMBER);
        return false;
    }

    execute({ playerId, worldRoomId, info }: Payload) {
        const { room } = this;
        room.worldRoomOf.set(playerId, worldRoomId);
        room.state.patch(playerId, { ...info, inWorld: true });
        this.result = ok({
            partyRoomId: room.roomId,
            revision: ++room.revision,
            lootMode: room.state.lootMode,
        });
    }
}
