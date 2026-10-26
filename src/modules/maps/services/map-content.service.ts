import { NpcKind } from "@/modules/npcs/enums/npc-kind.enum.js";
import { NpcFunctionType } from "@/modules/npcs/schemas/npc-function.schema.js";
import { npcService } from "@/modules/npcs/services/npc.service.js";
import { mapService } from "@/modules/maps/services/map.service.js";
export class MapContentService {
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
            /** NPC và vật thể (cổng, bệ teleport, bảng thông báo...) đặt trong map. */
            npcs: map.npcs.map((placement) => {
                const npc = npcService.getByCode(placement.npcCode);
                const portal = npcService
                    .functionsOf(placement)
                    .find((fn) => fn.type === NpcFunctionType.PORTAL);
                return {
                    id: placement.id,
                    npcCode: placement.npcCode,
                    kind: npc?.kind ?? NpcKind.NPC,
                    autoOpen: npc?.autoOpen ?? false,
                    x: placement.x,
                    y: placement.y,
                    direction: placement.direction,
                    colliderWidth: npc?.colliderWidth ?? 0,
                    colliderHeight: npc?.colliderHeight ?? 0,
                    interactRadius: npcService.radiusOf(placement),
                    ...(portal ? portal.config : {}),
                };
            }),
        };
    }
}

export const mapContentService = new MapContentService();
