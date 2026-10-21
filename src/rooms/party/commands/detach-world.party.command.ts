import { ok } from "@/core/utils/result.util.js";
import type { Result } from "@/core/types/result.type.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { Command } from "@colyseus/command";

/** RPC từ world: world room cũ báo thành viên đã rời; chỉ tính khi room đó còn là room hiện tại của họ. */
export class DetachWorldPartyCommand extends Command<
    PartyRoom,
    { playerId: string; worldRoomId: string }
> {
    result: Result = ok();

    validate({ playerId, worldRoomId }: { playerId: string; worldRoomId: string }) {
        const { room } = this;
        return room.state.has(playerId) && room.worldRoomOf.get(playerId) === worldRoomId;
    }

    execute({ playerId }: { playerId: string; worldRoomId: string }) {
        const { room } = this;
        room.worldRoomOf.delete(playerId);
        room.state.patch(playerId, { inWorld: false });
    }
}
