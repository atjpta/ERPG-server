import { Response } from "@/core/response/response.js";
import { NpcErrorCode } from "@/modules/npcs/enums/npc-error-code.enum.js";
import type { NpcFunctionOf, NpcFunctionType } from "@/modules/npcs/schemas/npc-function.schema.js";
import type {
    NpcFunctionCheckRequest,
    OpenNpcFunction,
} from "@/modules/npcs/types/npc-function-check.type.js";
import type { PlayerState } from "@/modules/player/state/player.state.js";
import { callRoom } from "@/rooms/bus/room-bus.js";

export class NpcFunctionGlobalService {
    /**
     * Chức năng NPC loại `type` chỉ dùng được khi người chơi đã mở nó ở NPC và còn đứng gần (xem `NpcFunctionSessionManager.check`).
     * Global không biết vị trí nên hỏi world room đang giữ người chơi qua `rooms/bus`; chưa ở world room nào thì coi như chưa mở.
     * Thành công trả `config` của chức năng đang mở (đã qua schema khi seed) — vd `crafting` đọc nhóm công thức NPC đó chế được.
     */
    async require<T extends NpcFunctionType>(
        player: PlayerState,
        type: T
    ): Promise<Response<NpcFunctionOf<T>["config"]>> {
        const worldRoomId = player.worldRoomId;
        if (!worldRoomId) return Response.error(NpcErrorCode.NPC_FUNCTION_NOT_OPEN);
        const request: NpcFunctionCheckRequest = { playerId: player.playerId, type };
        const checked = await callRoom<OpenNpcFunction>(worldRoomId, "checkNpcFunction", request);
        if (Response.isError(checked)) return checked;
        return Response.success(checked.data.config as NpcFunctionOf<T>["config"]);
    }
}

export const npcFunctionGlobalService = new NpcFunctionGlobalService();
