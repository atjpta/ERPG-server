import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import { and, eq, ilike, or } from "drizzle-orm";
import { BaseService } from "@/core/services/base.service.js";
import { serviceError } from "@/core/utils/service-error.js";
import type {
    AdminCreateMapBody,
    AdminListMapsQuery,
    AdminUpdateMapBody,
} from "@/apis/admin/maps/validators/admin.map.validator.js";
import { GameMaps } from "@/modules/maps/entities/game-map.entity.js";
import { GameMapRepo } from "@/modules/maps/repositories/game-map.repository.js";

export class AdminMapService extends BaseService<typeof GameMaps> {
    constructor() {
        super(GameMapRepo);
    }

    async list(query: AdminListMapsQuery) {
        const { search, type, status, ...pagination } = query;
        const where = and(
            search
                ? or(ilike(GameMaps.code, `%${search}%`), ilike(GameMaps.name, `%${search}%`))
                : undefined,
            type ? eq(GameMaps.type, type) : undefined,
            status ? eq(GameMaps.status, status) : undefined
        );
        return this.paginate({ pagination, where });
    }

    async createMap(body: AdminCreateMapBody) {
        if (await GameMapRepo.findByCode({ code: body.code })) {
            serviceError("Map code is existed", 409, MapErrorCode.MAP_CODE_EXISTS);
        }
        return this.create({ data: body });
    }

    async updateMap(id: string, body: AdminUpdateMapBody) {
        return this.updateById({ id, data: body });
    }
}

export const adminMapService = new AdminMapService();
