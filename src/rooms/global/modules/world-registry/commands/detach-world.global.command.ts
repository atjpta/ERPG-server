import { Response } from "@/core/utils/response.util.js";
import type { Result } from "@/core/types/result.type.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import { PartyNotice } from "@/rooms/global/modules/party/enums/party-notice.enum.js";
import { Command } from "@colyseus/command";
import { playerDataGlobalService } from "@/rooms/global/modules/player-data/services/player-data.global.service.js";
import { worldRegistryGlobalService } from "@/rooms/global/modules/world-registry/services/world-registry.global.service.js";
import { partyGlobalService } from "@/rooms/global/modules/party/services/party.global.service.js";

interface Payload {
    playerId: string;
    worldRoomId: string;
    /** Đang chuyển sang world room khác (map / dungeon): giữ nguyên party. Không có = rời hẳn. */
    changingMap?: boolean;
}

/**
 * RPC từ world: world room cũ báo player đã rời; chỉ tính khi room đó còn là room hiện tại của họ (đổi map thì room
 * mới đã ghi đè). Rời hẳn (không phải đổi map) thì thành viên party ra khỏi party luôn; đổi map thì giữ nguyên.
 */
export class DetachWorldGlobalCommand extends Command<GlobalRoom, Payload> {
    result: Result = Response.success();

    execute({ playerId, worldRoomId, changingMap }: Payload) {
        const { room } = this;
        if (!worldRegistryGlobalService.detachWorld(room, playerId, worldRoomId) || changingMap)
            return;
        void playerDataGlobalService.releaseIfIdle(room, playerId);
        const party = room.state.parties.getPartyByPlayerId(playerId);
        if (party) partyGlobalService.removeMember(room, party, playerId, PartyNotice.MEMBER_LEFT);
    }
}
