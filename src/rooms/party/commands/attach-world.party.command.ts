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
    result: PartySnapshot | null = null;

    execute({ playerId, worldRoomId, info }: Payload) {
        const { room } = this;
        if (!room.state.has(playerId)) return;
        room.worldRoomOf.set(playerId, worldRoomId);
        room.state.patch(playerId, { ...info, inWorld: true });
        this.result = {
            partyRoomId: room.roomId,
            revision: ++room.revision,
            lootMode: room.state.lootMode,
        };
    }
}
