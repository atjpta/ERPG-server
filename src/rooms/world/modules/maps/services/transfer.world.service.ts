import { Response } from "@/core/response/response.js";
import { RoomResponse } from "@/core/response/room-response.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import type { GameMap } from "@/modules/maps/entities/game-map.entity.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { mapFileService } from "@/modules/maps/services/map-file.service.js";
import { mapService } from "@/modules/maps/services/map.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { partyDungeonWorldService } from "@/rooms/world/modules/dungeons/services/party-dungeon.world.service.js";
import type { PlayerWorldState } from "@/modules/player/state/player-world.state.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { WorldRoomName } from "@/rooms/world/modules/maps/enums/world-room-name.enum.js";
import type { MapChangeMessage } from "@/rooms/world/modules/maps/interfaces/map.world.message.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/** Đưa player tới điểm spawn `spawnId` của map `mapCode` (portal, teleport trong thoại). */
export class TransferWorldService {
    /** Thành công hoặc `Response` thất bại (mã lỗi nghiệp vụ). */
    async transfer(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        mapCode: string,
        spawnId: string,
        /** Đặt player đúng toạ độ này thay vì tra spawn point (dịch chuyển tới bệ teleport). */
        point?: { x: number; y: number }
    ): Promise<Response> {
        if (player.pendingMapCode) return Response.error(MapErrorCode.MAP_ALREADY_CHANGING);
        const sameMap = mapCode === room.map.code;
        let target: GameMap;
        try {
            target = sameMap ? room.map : await mapService.getActiveByCodeOrFail(mapCode);
        } catch {
            return Response.error(MapErrorCode.MAP_NOT_OPEN);
        }
        if (!sameMap && player.level < target.minLevel)
            return Response.error(PlayerErrorCode.LEVEL_TOO_LOW);
        // Dungeon: instance riêng + lưu chỗ đứng cũ, không dùng chuyển map thường.
        if (target.type === MapType.DUNGEON) {
            if (room.dungeon !== undefined) return Response.error(MapErrorCode.MAP_NOT_OPEN);
            if (!target.spawnPoints.some((point) => point.id === spawnId)) {
                return Response.error(MapErrorCode.MAP_SPAWN_NOT_FOUND);
            }
            return partyDungeonWorldService.startDungeon(room, client, player, target, spawnId);
        }
        const spawn = point ?? target.spawnPoints.find((p) => p.id === spawnId);
        if (!spawn) return Response.error(MapErrorCode.MAP_SPAWN_NOT_FOUND);

        player.placeAt(spawn.x, spawn.y);
        if (sameMap) return Response.success();

        // Từ đây mọi lần lưu (checkpoint, rời room) ghi map đích thay vì map cũ.
        player.beginMapChange(mapCode);
        const message: MapChangeMessage = { mapCode, spawnId, roomName: WorldRoomName.WORLD };
        await worldService.savePlayer(room, client.auth.playerId);
        RoomResponse.send(client, WorldMessage.MAP_CHANGE, message);
        return Response.success();
    }

    /**
     * Chết ngoài dungeon: hồi đầy máu tại điểm hồi sinh của town gần nhất đã đến
     * (`player_states.last_town_map_code`, chưa có thì map khởi đầu). Town không mở → map khởi đầu.
     */
    async respawnAtTown(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState
    ): Promise<void> {
        const config = masterDataCacheService.get(MasterDataKey.PLAYER_CONFIG);
        let mapCode = player.lastTownMapCode ?? config.startMapCode;
        let target: GameMap;
        try {
            target =
                mapCode === room.map.code
                    ? room.map
                    : await mapService.getActiveByCodeOrFail(mapCode);
        } catch {
            mapCode = config.startMapCode;
            target = await mapService.getActiveByCodeOrFail(mapCode);
        }
        const spawn = mapFileService.respawnPointOf(target);
        player.setSpawns(spawn.x, spawn.y);
        if (mapCode === room.map.code) return;

        player.beginMapChange(mapCode);
        const message: MapChangeMessage = {
            mapCode,
            spawnId: "default",
            roomName: WorldRoomName.WORLD,
        };
        await worldService.savePlayer(room, client.auth.playerId);
        RoomResponse.send(client, WorldMessage.MAP_CHANGE, message);
    }
}

export const transferWorldService = new TransferWorldService();
