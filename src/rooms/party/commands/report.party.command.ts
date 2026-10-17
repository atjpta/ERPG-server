import type { PartyRoom } from "@/rooms/party/party.room.js";
import type { PartyMemberInfo } from "@/rooms/party/schemas/party.schema.js";
import { Command } from "@colyseus/command";

interface Payload {
    worldRoomId: string;
    revision: number;
    updates: (Pick<PartyMemberInfo, "playerId"> & Partial<PartyMemberInfo>)[];
}

/** RPC từ world: báo HP / level / map thành viên (gộp, tối đa ~1 lần/giây); bản cũ bị bỏ qua. */
export class ReportPartyCommand extends Command<PartyRoom, Payload> {
    result = true;

    execute({ worldRoomId, revision, updates }: Payload) {
        const { room } = this;
        if (revision <= (room.worldReportRevisions.get(worldRoomId) ?? -1)) return;
        room.worldReportRevisions.set(worldRoomId, revision);
        for (const { playerId, ...patch } of updates) {
            if (room.worldRoomOf.get(playerId) === worldRoomId) room.state.patch(playerId, patch);
        }
    }
}
