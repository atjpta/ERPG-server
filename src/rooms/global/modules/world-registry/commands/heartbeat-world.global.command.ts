import { worldRegistryGlobalService } from "@/rooms/global/modules/world-registry/services/world-registry.global.service.js";
import { Response } from "@/core/utils/response.util.js";
import type { Result } from "@/core/types/result.type.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import { Command } from "@colyseus/command";

interface Payload {
    worldRoomId: string;
    mapCode: string;
    instanceId?: string;
    /** Mọi player đang ở world room này. */
    playerIds: string[];
}

/** RPC từ world (mỗi ~30 giây): làm mới vị trí các player nó đang giữ, để global không coi họ là offline. */
export class HeartbeatWorldGlobalCommand extends Command<GlobalRoom, Payload> {
    result: Result = Response.success();

    async execute({ worldRoomId, mapCode, instanceId, playerIds }: Payload) {
        await worldRegistryGlobalService.refreshWorld(
            this.room,
            worldRoomId,
            { mapCode, instanceId },
            playerIds,
            this.clock.currentTime
        );
    }
}
