import type { Queryable } from "@/configs/postgres.config.js";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { serviceError } from "@/core/utils/service-error.js";
import { npcService } from "@/modules/npcs/services/npc.service.js";
import { listTeleportDestinations } from "@/modules/maps/utils/teleport.util.js";
import { MapStatus } from "@/modules/maps/enums/map.enum.js";
import { GameMapRepo } from "@/modules/maps/repositories/game-map.repository.js";

export class MapService {
    /** Metadata các map active — không kèm layout (xem `getContent`) để danh sách gọn. */
    async listActive() {
        const maps = await GameMapRepo.findActive();
        return maps.map(
            ({ colliders, npcs, interactables, spawnPoints, monsterSpawns, dungeon, ...summary }) =>
                summary
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
            minLevel: map.minLevel,
            contentHash: map.contentHash,
            spawnPoints: map.spawnPoints,
            colliders: map.colliders,
            /** Dungeon: cổng chắn của từng chamber (client vẽ prefab và dự đoán va chạm cùng dữ liệu). */
            gateCode: map.dungeon?.gateCode ?? "",
            chambers: (map.dungeon?.chambers ?? []).map((chamber) => ({
                id: chamber.id,
                ...(chamber.entryGate ? { entryGate: chamber.entryGate } : {}),
                ...(chamber.exitGate ? { exitGate: chamber.exitGate } : {}),
            })),
            /** Monster có thể xuất hiện trong map — client tải trước prefab của chúng. */
            monsterCodes: [...new Set(map.monsterSpawns.map((spawn) => spawn.monsterCode))],
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
                code: it.code,
                direction: it.direction,
                x: it.x,
                y: it.y,
                radius: it.radius,
                ...(it.type === "portal"
                    ? { targetMapCode: it.targetMapCode, targetSpawnId: it.targetSpawnId }
                    : {}),
            })),
        };
    }

    /** Điểm đến teleport từ map `currentMapCode` (map active có bệ teleport, trừ dungeon và map hiện tại). */
    async listTeleportDestinations(currentMapCode: string) {
        return listTeleportDestinations(await GameMapRepo.findActive(), currentMapCode);
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
