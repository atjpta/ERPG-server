import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import type { Queryable } from "@/configs/postgres.config.js";
import { Response } from "@/core/response/response.js";
import { teleportService } from "@/modules/maps/services/teleport.service.js";
import { MapStatus } from "@/modules/maps/enums/map.enum.js";
import { GameMapRepo } from "@/modules/maps/repositories/game-map.repository.js";

export class MapService {
    /** Điểm đến teleport từ map `currentMapCode`: mọi map trừ dungeon và map hiện tại (map chưa đi được có `open = false`). */
    async listTeleportDestinations(currentMapCode: string) {
        return teleportService.listTeleportDestinations(
            await GameMapRepo.findMany(),
            currentMapCode
        );
    }

    /** Mọi map đang mở (`ACTIVE`), theo mã. */
    async listActive(dbOrTx?: Queryable) {
        return GameMapRepo.findActive({ dbOrTx });
    }

    async getActiveByCodeOrFail(code: string, dbOrTx?: Queryable) {
        const map = await GameMapRepo.findByCode({ code, dbOrTx });
        if (!map || map.status !== MapStatus.ACTIVE) {
            Response.abort(MapErrorCode.MAP_NOT_FOUND);
        }
        return map;
    }
}

export const mapService = new MapService();
