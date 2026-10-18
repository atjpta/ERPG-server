import type { ErrorCode } from "@/core/types/result.type.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import type { GameMap } from "@/modules/maps/entities/game-map.entity.js";
import { mapService } from "@/modules/maps/services/map.service.js";
import { dungeonWorldService } from "@/rooms/world/modules/dungeons/services/dungeon.world.service.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

import { dungeonPartyCoordinator } from "@/rooms/coordinators/dungeon-party.coordinator.js";
import { playerPartyWorldService } from "@/rooms/world/modules/players/services/player-party.world.service.js";
export class PartyDungeonWorldService {
    /**
     * Vào dungeon luôn đi qua party: chưa có thì tự tạo party 1 người. Chủ yêu cầu party room kiểm cả
     * nhóm; đạt hết thì party room ra lệnh cho world room của từng thành viên (kể cả chủ). Thành viên
     * không phải chủ → `party_not_leader`; có người không đạt → `party_denied` (cả party đã được báo).
     */
    async startDungeon(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        dungeon: GameMap,
        spawnId: string
    ): Promise<ErrorCode | undefined> {
        const partyRoomId = await playerPartyWorldService.ensureParty(room, player);
        if (!partyRoomId) return MapErrorCode.MAP_NOT_OPEN;
        const result = await dungeonPartyCoordinator.launch(partyRoomId, {
            leaderPlayerId: player.id,
            code: dungeon.code,
            minLevel: dungeon.minLevel,
            spawnId,
            retry: false,
        });
        if (result.success) return undefined;
        return result.code === CommonCode.ROOM_UNAVAILABLE
            ? MapErrorCode.MAP_NOT_OPEN
            : result.code;
    }

    /**
     * Kiểm tra `playerId` (đang ở room này) có vào được dungeon không (nguồn sự thật, dùng cho cả kiểm tra
     * trước và lúc vào thật): trả mã lỗi hoặc thông tin để vào.
     */
    private async validate(room: WorldRoom, playerId: string, dungeonCode: string, retry: boolean) {
        const found = playerPartyWorldService.findPlayer(room, playerId);
        if (!found) return { error: PlayerErrorCode.PLAYER_OFFLINE };
        const { player } = found;
        // Đang trong dungeon thì chỉ được sang instance mới của chính dungeon này sau khi đã clear ("đi lại").
        const canRetry = retry && room.dungeon?.cleared && room.map.code === dungeonCode;
        if (room.isDungeon && !canRetry) return { error: MapErrorCode.DUNGEON_ALREADY_IN };
        if (player.hp <= 0) return { error: PlayerErrorCode.PLAYER_DEAD };
        if (player.pendingMapCode) return { error: PlayerErrorCode.PLAYER_OFFLINE };
        let dungeon: GameMap;
        try {
            dungeon = await mapService.getActiveByCodeOrFail(dungeonCode);
        } catch {
            return { error: MapErrorCode.MAP_NOT_OPEN };
        }
        if (player.level < dungeon.minLevel) return { error: PlayerErrorCode.LEVEL_TOO_LOW };
        return { ...found, dungeon };
    }

    /** Party room ra lệnh: đưa `playerId` vào instance dungeon; trả mã lỗi hoặc `undefined` khi đã gửi `mapChange`. */
    async enterDungeon(
        room: WorldRoom,
        playerId: string,
        dungeonCode: string,
        instanceId: string,
        spawnId: string,
        retry = false
    ): Promise<ErrorCode | undefined> {
        const checked = await this.validate(room, playerId, dungeonCode, retry);
        if ("error" in checked) return checked.error;
        const { client, player, dungeon } = checked;
        return dungeonWorldService.enter(room, client, player, dungeon, spawnId, instanceId);
    }

    /** Kiểm tra trước khi vào: mã lỗi hoặc `undefined` = vào được. */
    async checkDungeon(
        room: WorldRoom,
        playerId: string,
        dungeonCode: string,
        retry = false
    ): Promise<ErrorCode | undefined> {
        return (await this.validate(room, playerId, dungeonCode, retry)).error;
    }
}
export const partyDungeonWorldService = new PartyDungeonWorldService();
