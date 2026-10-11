import type { GameMap, MapPortal } from "@/modules/maps/entities/game-map.entity.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { partyWorldService } from "@/rooms/world/services/party.world.service.js";
import { mapService } from "@/modules/maps/user/services/map.service.js";
import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import type { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import {
    MapTransferError,
    WorldMessage,
    WorldRoomName,
    type MapChangeMessage,
} from "@/rooms/world/world.message.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/** Đưa player tới điểm spawn `spawnId` của map `mapCode` (portal, teleport trong thoại). */
export class TransferWorldService {
    /** Trả lỗi (chuỗi) hoặc `undefined` khi thành công. */
    async transfer(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        mapCode: string,
        spawnId: string,
        /** Đặt player đúng toạ độ này thay vì tra spawn point (dịch chuyển giữa 2 cổng). */
        point?: { x: number; y: number }
    ): Promise<string | undefined> {
        if (player.pendingMapCode) return "Already changing map";
        const sameMap = mapCode === room.map.code;
        let target: GameMap;
        try {
            target = sameMap ? room.map : await mapService.getActiveByCodeOrFail(mapCode);
        } catch {
            return MapTransferError.MAP_NOT_OPEN;
        }
        if (!sameMap && player.level < target.minLevel) return MapTransferError.LEVEL_TOO_LOW;
        // Dungeon: instance riêng + lưu chỗ đứng cũ, không dùng chuyển map thường.
        if (target.type === MapType.DUNGEON) {
            if (room.dungeon) return MapTransferError.MAP_NOT_OPEN;
            if (!target.spawnPoints.some((point) => point.id === spawnId)) {
                return "Spawn point not found";
            }
            return partyWorldService.startDungeon(room, client, player, target, spawnId);
        }
        const spawn = point ?? target.spawnPoints.find((p) => p.id === spawnId);
        if (!spawn) return "Spawn point not found";

        player.x = spawn.x;
        player.y = spawn.y;
        player.moving = false;
        player.targetId = "";
        player.targetLocked = false;
        if (sameMap) return undefined;

        // Từ đây mọi lần lưu (checkpoint, rời room) ghi map đích thay vì map cũ.
        player.pendingMapCode = mapCode;
        const message: MapChangeMessage = { mapCode, spawnId, roomName: WorldRoomName.WORLD };
        client.send(WorldMessage.MAP_CHANGE, message);
        await worldService.savePlayer(room, client.sessionId);
        return undefined;
    }

    /**
     * Dùng một cổng. Đích là spawn point của map đích, hoặc **vị trí của cổng khác** (`targetPortalId`,
     * cùng map thì dịch chuyển tức thì, khác map thì đổi room). Cổng đích chưa được Unity đặt vị trí
     * thì chưa dùng được (`map_not_open`).
     */
    async viaPortal(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        portal: MapPortal
    ): Promise<string | undefined> {
        if (portal.targetPortalId === undefined) {
            return this.transfer(room, client, player, portal.targetMapCode, portal.targetSpawnId!);
        }
        let target: GameMap;
        try {
            target =
                portal.targetMapCode === room.map.code
                    ? room.map
                    : await mapService.getActiveByCodeOrFail(portal.targetMapCode);
        } catch {
            return MapTransferError.MAP_NOT_OPEN;
        }
        const exit = target.interactables.find(
            (it) => it.type === "portal" && it.id === portal.targetPortalId
        );
        if (!exit) return MapTransferError.MAP_NOT_OPEN;
        return this.transfer(room, client, player, portal.targetMapCode, exit.id, {
            x: exit.x,
            y: exit.y,
        });
    }
}

export const transferWorldService = new TransferWorldService();
