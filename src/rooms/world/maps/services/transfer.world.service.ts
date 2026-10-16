import type { GameMap } from "@/modules/maps/entities/game-map.entity.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { respawnPointOf } from "@/modules/maps/utils/map-file.util.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/user/services/master-data-cache.service.js";
import { partyWorldService } from "@/rooms/world/party/services/party.world.service.js";
import { mapService } from "@/modules/maps/user/services/map.service.js";
import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import type { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import { worldService } from "@/rooms/world/core/services/world.service.js";
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
        /** Đặt player đúng toạ độ này thay vì tra spawn point (dịch chuyển tới bệ teleport). */
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
            if (room.isDungeon) return MapTransferError.MAP_NOT_OPEN;
            if (!target.spawnPoints.some((point) => point.id === spawnId)) {
                return "Spawn point not found";
            }
            return partyWorldService.startDungeon(room, client, player, target, spawnId);
        }
        const spawn = point ?? target.spawnPoints.find((p) => p.id === spawnId);
        if (!spawn) return "Spawn point not found";

        player.placeAt(spawn.x, spawn.y);
        if (sameMap) return undefined;

        // Từ đây mọi lần lưu (checkpoint, rời room) ghi map đích thay vì map cũ.
        player.beginMapChange(mapCode);
        const message: MapChangeMessage = { mapCode, spawnId, roomName: WorldRoomName.WORLD };
        client.send(WorldMessage.MAP_CHANGE, message);
        await worldService.savePlayer(room, client.sessionId);
        return undefined;
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
        const spawn = respawnPointOf(target);
        player.setSpawns(spawn.x, spawn.y);
        if (mapCode === room.map.code) return;

        player.beginMapChange(mapCode);
        const message: MapChangeMessage = {
            mapCode,
            spawnId: "default",
            roomName: WorldRoomName.WORLD,
        };
        client.send(WorldMessage.MAP_CHANGE, message);
        await worldService.savePlayer(room, client.sessionId);
    }
}

export const transferWorldService = new TransferWorldService();
