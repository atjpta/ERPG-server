import type { Queryable } from "@/configs/postgres.config.js";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { serviceError } from "@/core/utils/service-error.js";
import { MapStatus } from "@/modules/maps/enums/map.enum.js";
import { GameMapRepo } from "@/modules/maps/repositories/game-map.repository.js";

export class MapService {
    async listActive() {
        return GameMapRepo.findActive();
    }

    async getActiveByCodeOrFail(code: string, dbOrTx?: Queryable) {
        const map = await GameMapRepo.findByCode({ code, dbOrTx });
        if (!map || map.status !== MapStatus.ACTIVE) {
            serviceError(`Map "${code}" not found`, 404, ResponseCode.MAP_NOT_FOUND);
        }
        return map;
    }
}

export const mapService = new MapService();
