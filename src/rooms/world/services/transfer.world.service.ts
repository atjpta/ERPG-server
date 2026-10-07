import { mapService } from "@/modules/maps/user/services/map.service.js";
import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import type { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import { WorldMessage, type MapChangeMessage } from "@/rooms/world/world.message.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/** Đưa player tới điểm spawn `spawnId` của map `mapCode` (portal, teleport trong thoại). */
export class TransferWorldService {
    /** Trả lỗi (chuỗi) hoặc `undefined` khi thành công. */
    async transfer(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        mapCode: string,
        spawnId: string
    ): Promise<string | undefined> {
        if (player.pendingMapCode) return "Already changing map";
        const sameMap = mapCode === room.map.code;
        let target: { spawnPoints: readonly { id: string; x: number; y: number }[] };
        try {
            target = sameMap ? room.map : await mapService.getActiveByCodeOrFail(mapCode);
        } catch {
            return "Map not available";
        }
        const spawn = target.spawnPoints.find((point) => point.id === spawnId);
        if (!spawn) return "Spawn point not found";

        player.x = spawn.x;
        player.y = spawn.y;
        player.moving = false;
        player.targetId = "";
        player.targetLocked = false;
        if (sameMap) return undefined;

        // Từ đây mọi lần lưu (checkpoint, rời room) ghi map đích thay vì map cũ.
        player.pendingMapCode = mapCode;
        const message: MapChangeMessage = { mapCode, spawnId };
        client.send(WorldMessage.MAP_CHANGE, message);
        await worldService.savePlayer(room, client.sessionId);
        return undefined;
    }
}

export const transferWorldService = new TransferWorldService();
