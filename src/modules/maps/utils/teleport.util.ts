import { MapType } from "@/modules/maps/enums/map.enum.js";

export interface TeleportDestination {
    mapCode: string;
    /** Bệ teleport đầu tiên của map — chỗ người chơi xuất hiện. */
    teleportId: string;
    minLevel: number;
    x: number;
    y: number;
}

interface TeleportMapLike {
    code: string;
    type: MapType | string;
    minLevel: number;
    interactables: readonly { id: string; type: string; x: number; y: number }[];
}

/**
 * Điểm đến của teleport: mọi map (trừ dungeon và `currentMapCode`) có ít nhất một bệ teleport đã đặt vị
 * trí; mỗi map một điểm đến (bệ đầu tiên). Sắp theo level vào map rồi theo code.
 */
export const listTeleportDestinations = (
    maps: readonly TeleportMapLike[],
    currentMapCode?: string
): TeleportDestination[] =>
    maps
        .filter((map) => map.type !== MapType.DUNGEON && map.code !== currentMapCode)
        .flatMap((map) => {
            const pad = map.interactables.find((it) => it.type === "teleport");
            return pad
                ? [
                      {
                          mapCode: map.code,
                          teleportId: pad.id,
                          minLevel: map.minLevel,
                          x: pad.x,
                          y: pad.y,
                      },
                  ]
                : [];
        })
        .sort((a, b) => a.minLevel - b.minLevel || a.mapCode.localeCompare(b.mapCode));
