import { Response } from "@/core/response/response.js";
import { NpcErrorCode } from "@/modules/npcs/enums/npc-error-code.enum.js";
import type { NpcFunctionType } from "@/modules/npcs/schemas/npc-function.schema.js";
import type { NpcFunctionCheckRequest } from "@/modules/npcs/types/npc-function-check.type.js";
import type { PlayerState } from "@/modules/player/state/player.state.js";
import { callRoom } from "@/rooms/bus/room-bus.js";

export class NpcFunctionGlobalService {
    /**
     * Chức năng NPC loại `type` chỉ dùng được khi người chơi đã mở nó ở NPC và còn đứng gần (xem `NpcFunctionSessionManager.check`).
     * Global không biết vị trí nên hỏi world room đang giữ người chơi qua `rooms/bus`; chưa ở world room nào thì coi như chưa mở.
     */
    async require(player: PlayerState, type: NpcFunctionType): Promise<Response> {
        const worldRoomId = player.worldRoomId;
        if (!worldRoomId) return Response.error(NpcErrorCode.NPC_FUNCTION_NOT_OPEN);
        const request: NpcFunctionCheckRequest = { playerId: player.playerId, type };
        const checked = await callRoom(worldRoomId, "checkNpcFunction", request);
        return Response.isError(checked) ? checked : Response.success();
    }
}

export const npcFunctionGlobalService = new NpcFunctionGlobalService();
