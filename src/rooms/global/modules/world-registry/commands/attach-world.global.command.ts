import { worldRegistryGlobalService } from "@/rooms/global/modules/world-registry/services/world-registry.global.service.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import type { PartySnapshot } from "@/rooms/global/modules/party/types/party-rpc.type.js";
import { Command } from "@colyseus/command";

interface Payload {
    worldRoomId: string;
    mapCode: string;
    /** `instanceId` chỉ có khi world room là một instance dungeon. */
    instanceId?: string;
    playerId: string;
}

/**
 * RPC từ world: world room mới báo player đã vào (vào game / đổi map / vào dungeon). Ghi vị trí của player;
 * nếu họ đang ở một party thì cập nhật thành viên và trả snapshot (`null` = không ở party nào).
 */
export class AttachWorldGlobalCommand extends Command<GlobalRoom, Payload> {
    result: Result<PartySnapshot | null> = Response.error(CommonCode.ROOM_UNAVAILABLE);

    async execute({ worldRoomId, mapCode, instanceId, playerId }: Payload) {
        const { room } = this;
        await worldRegistryGlobalService.attachWorld(
            room,
            playerId,
            worldRoomId,
            { mapCode, instanceId },
            this.clock.currentTime
        );
        const party = room.state.parties.getPartyByPlayerId(playerId);
        if (!party) {
            this.result = Response.success<PartySnapshot | null>(null);
            return;
        }
        this.result = Response.success<PartySnapshot | null>({
            partyId: party.id,
            revision: ++party.revision,
            lootMode: party.lootMode,
        });
    }
}
