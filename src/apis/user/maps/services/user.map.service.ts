import { GameMapRepo } from "@/modules/maps/repositories/game-map.repository.js";
import { npcService } from "@/modules/npcs/services/npc.service.js";
import { mapService } from "@/modules/maps/services/map.service.js";
export class UserMapService {
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
        const map = await mapService.getActiveByCodeOrFail(code);
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
}

export const userMapService = new UserMapService();
