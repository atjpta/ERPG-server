import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import type { Queryable } from "@/configs/postgres.config.js";
import { serviceError } from "@/core/utils/service-error.js";
import { listTeleportDestinations } from "@/modules/maps/services/teleport.service.js";
import { MapStatus } from "@/modules/maps/enums/map.enum.js";
import { GameMapRepo } from "@/modules/maps/repositories/game-map.repository.js";

export class MapService {
    /** Điểm đến teleport từ map `currentMapCode`: mọi map trừ dungeon và map hiện tại (map chưa đi được có `open = false`). */
    async listTeleportDestinations(currentMapCode: string) {
        return listTeleportDestinations(await GameMapRepo.findMany(), currentMapCode);
    }

    async getActiveByCodeOrFail(code: string, dbOrTx?: Queryable) {
        const map = await GameMapRepo.findByCode({ code, dbOrTx });
        if (!map || map.status !== MapStatus.ACTIVE) {
            serviceError(`Map "${code}" not found`, 404, MapErrorCode.MAP_NOT_FOUND);
        }
        return map;
    }
}

export const mapService = new MapService();
