import type { Queryable } from "@/configs/postgres.config.js";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { serviceError } from "@/core/utils/service-error.js";
import { npcService } from "@/modules/npcs/services/npc.service.js";
import { MapStatus } from "@/modules/maps/enums/map.enum.js";
import { GameMapRepo } from "@/modules/maps/repositories/game-map.repository.js";

export class MapService {
    /** Metadata các map active — không kèm layout (xem `getContent`) để danh sách gọn. */
    async listActive() {
        const maps = await GameMapRepo.findActive();
        return maps.map(
            ({ colliders, npcs, interactables, spawnPoints, monsterSpawns, ...summary }) => summary
        );
    }

    /**
     * Layout 1 map cho client đối chiếu với scene Unity (collider, spawn, NPC, portal) và dựng minimap.
     * `contentHash` so với hash của file `<code>.map.json` trong build để phát hiện lệch.
     */
    async getContent(code: string) {
        const map = await this.getActiveByCodeOrFail(code);
        return {
            code: map.code,
            width: map.width,
            height: map.height,
            tileSize: map.tileSize,
            contentHash: map.contentHash,
            spawnPoints: map.spawnPoints,
            colliders: map.colliders,
            npcs: map.npcs.map((placement) => {
                const npc = npcService.getByCode(placement.npcCode);
                return {
                    ...placement,
                    colliderWidth: npc?.colliderWidth ?? 0,
                    colliderHeight: npc?.colliderHeight ?? 0,
                    interactRadius: npc?.interactRadius ?? 0,
                };
            }),
            interactables: map.interactables.map((it) => ({
                id: it.id,
                type: it.type,
                x: it.x,
                y: it.y,
                radius: it.radius,
                ...(it.type === "portal"
                    ? { targetMapCode: it.targetMapCode, targetSpawnId: it.targetSpawnId }
                    : {}),
            })),
        };
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
