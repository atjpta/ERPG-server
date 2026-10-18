import { PartyErrorCode } from "@/rooms/party/types/party-error-code.type.js";
import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { Result } from "@/core/types/result.type.js";
import { fail, ok } from "@/core/utils/result.util.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { broadcastDungeonDenied } from "@/rooms/party/services/party-notify.js";
import type { DungeonPartyPlan, DungeonPartyRequest } from "@/rooms/party/types/party-room.type.js";
import { Command } from "@colyseus/command";

/** RPC từ coordinator: kiểm tra cả party có vào dungeon được không và trả danh sách thành viên. */
export class PrepareDungeonPartyCommand extends Command<PartyRoom, DungeonPartyRequest> {
    result: Result<DungeonPartyPlan> = fail(CommonCode.ROOM_UNAVAILABLE);

    execute(request: DungeonPartyRequest) {
        const { room } = this;
        const { state } = room;
        if (!state.isLeader(request.leaderPlayerId)) {
            this.result = fail(PartyErrorCode.PARTY_NOT_LEADER);
            return;
        }
        if (request.retry) {
            if (!state.joinOrder.every((id) => request.presentPlayerIds?.includes(id))) {
                this.result = fail(MapErrorCode.DUNGEON_NOT_TOGETHER);
                return;
            }
        } else {
            const failures = state.checkDungeon(request.minLevel ?? 0);
            if (failures.length) {
                broadcastDungeonDenied(room, request.code, failures);
                this.result = fail(MapErrorCode.DUNGEON_DENIED, undefined, { failures });
                return;
            }
        }
        this.result = ok({
            members: state.joinOrder.map((playerId) => ({
                playerId,
                name: state.nameOf(playerId),
                worldRoomId: room.worldRoomOf.get(playerId) ?? null,
            })),
        });
    }
}
