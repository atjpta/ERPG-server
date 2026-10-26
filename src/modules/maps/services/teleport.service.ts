import { MapType } from "@/modules/maps/enums/map.enum.js";
import type { MapNpc } from "@/modules/maps/types/game-map.type.js";
import { NpcFunctionType, type NpcFunction } from "@/modules/npcs/schemas/npc-function.schema.js";
import { npcService } from "@/modules/npcs/services/npc.service.js";
import type { TeleportDestination, TeleportStatus } from "@/modules/maps/types/teleport.type.js";

interface TeleportMapLike {
    code: string;
    type: MapType | string;
    minLevel: number;
    /** Bỏ trống = coi như đang mở. */
    status?: string;
    npcs: readonly MapNpc[];
}

export class TeleportService {
    /**
     * Danh sách teleport: **mọi** map trừ dungeon và `currentMapCode`, mỗi map một điểm đến (NPC / vật thể có chức năng `teleport` đầu tiên).
     * Map chưa có bệ đã đặt vị trí (hoặc chưa mở) vẫn có trong danh sách với `open = false` để client hiện mờ,
     * không cho chọn. Sắp theo level vào map rồi theo code.
     */
    listTeleportDestinations(
        maps: readonly TeleportMapLike[],
        currentMapCode?: string
    ): TeleportDestination[] {
        return maps
            .filter((map) => map.type !== MapType.DUNGEON && map.code !== currentMapCode)
            .map((map): TeleportDestination => {
                const pad = this.findPad(map);
                const active = map.status === undefined || map.status === "active";
                return pad && active
                    ? {
                          mapCode: map.code,
                          teleportId: pad.slot.id,
                          minLevel: map.minLevel,
                          x: pad.slot.x,
                          y: pad.slot.y,
                          open: true,
                          ...(pad.config.openToAll ? { openToAll: true } : {}),
                      }
                    : { mapCode: map.code, minLevel: map.minLevel, open: false };
            })
            .sort((a, b) => a.minLevel - b.minLevel || a.mapCode.localeCompare(b.mapCode));
    }

    /** Bệ teleport đầu tiên của map: slot có chức năng `teleport` (của slot hoặc của NPC) và config của nó. */
    private findPad(map: TeleportMapLike) {
        for (const slot of map.npcs) {
            const fn = npcService
                .functionsOf(slot)
                .find(
                    (f): f is Extract<NpcFunction, { type: NpcFunctionType.TELEPORT }> =>
                        f.type === NpcFunctionType.TELEPORT
                );
            if (fn) return { slot, config: fn.config };
        }
        return undefined;
    }

    /** Flag ghi vào `player_states.flags` khi player đã đến một map — điều kiện để teleport tới map đó. */
    visitedFlagKey(mapCode: string) {
        return `visited.${mapCode}`;
    }

    hasVisited(flags: Record<string, unknown>, mapCode: string) {
        return Boolean(flags[this.visitedFlagKey(mapCode)]);
    }

    /**
     * Trạng thái của một điểm đến đối với player: phải đã đến map đó (trừ map `openToAll`) và đủ level mới
     * teleport được.
     */
    teleportStatus(
        destination: Pick<TeleportDestination, "mapCode" | "minLevel"> & {
            open?: boolean;
            openToAll?: boolean;
        },
        level: number,
        flags: Record<string, unknown>
    ): TeleportStatus {
        const discovered =
            destination.openToAll === true || this.hasVisited(flags, destination.mapCode);
        const levelOk = level >= destination.minLevel;
        return {
            discovered,
            levelOk,
            available: discovered && levelOk && destination.open !== false,
        };
    }
}

export const teleportService = new TeleportService();
