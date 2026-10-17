import type { PartyRoom } from "@/rooms/party/party.room.js";
import { broadcastDungeonDenied } from "@/rooms/party/services/party-notify.js";
import type { DungeonPartyPlan, DungeonPartyRequest } from "@/rooms/party/types/party-room.type.js";
import { Command } from "@colyseus/command";

/** RPC từ coordinator: kiểm tra cả party có vào dungeon được không và trả danh sách thành viên. */
export class PrepareDungeonPartyCommand extends Command<PartyRoom, DungeonPartyRequest> {
    result: DungeonPartyPlan = { ok: false, error: "unavailable" };

    execute(request: DungeonPartyRequest) {
        const { room } = this;
        const { state } = room;
        if (!state.isLeader(request.leaderPlayerId)) {
            this.result = { ok: false, error: "not_leader" };
            return;
        }
        if (request.retry) {
            if (!state.joinOrder.every((id) => request.presentPlayerIds?.includes(id))) {
                this.result = { ok: false, error: "not_together" };
                return;
            }
        } else {
            const failures = state.checkDungeon(request.minLevel ?? 0);
            if (failures.length) {
                broadcastDungeonDenied(room, request.code, failures);
                this.result = { ok: false, error: "denied" };
                return;
            }
        }
        this.result = {
            ok: true,
            members: state.joinOrder.map((playerId) => ({
                playerId,
                name: state.nameOf(playerId),
                worldRoomId: room.worldRoomOf.get(playerId) ?? null,
            })),
        };
    }
}
