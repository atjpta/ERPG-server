import { MapType } from "@/modules/maps/enums/map.enum.js";

export interface TeleportDestination {
    mapCode: string;
    /** Bệ teleport đầu tiên của map — chỗ người chơi xuất hiện (không có khi `open = false`). */
    teleportId?: string;
    minLevel: number;
    x?: number;
    y?: number;
    /** Map có bệ teleport đã đặt vị trí và đang mở — `false` thì vẫn hiện trong danh sách nhưng chưa đi được. */
    open: boolean;
    /** Bệ teleport của map khai `openToAll`: không cần đã từng đến map này. */
    openToAll?: boolean;
}

interface TeleportMapLike {
    code: string;
    type: MapType | string;
    minLevel: number;
    /** Bỏ trống = coi như đang mở. */
    status?: string;
    interactables: readonly {
        id: string;
        type: string;
        x: number;
        y: number;
        openToAll?: boolean;
    }[];
}

export interface TeleportStatus {
    /** Đã từng đến map đó. */
    discovered: boolean;
    /** Đủ level vào map đó. */
    levelOk: boolean;
    /** Teleport tới được ngay (đã đến + đủ level + map có bệ đang mở). */
    available: boolean;
}

export class TeleportService {
    /**
     * Danh sách teleport: **mọi** map trừ dungeon và `currentMapCode`, mỗi map một điểm đến (bệ teleport đầu tiên).
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
                const pad = map.interactables.find((it) => it.type === "teleport");
                const active = map.status === undefined || map.status === "active";
                return pad && active
                    ? {
                          mapCode: map.code,
                          teleportId: pad.id,
                          minLevel: map.minLevel,
                          x: pad.x,
                          y: pad.y,
                          open: true,
                          ...(pad.openToAll ? { openToAll: true } : {}),
                      }
                    : { mapCode: map.code, minLevel: map.minLevel, open: false };
            })
            .sort((a, b) => a.minLevel - b.minLevel || a.mapCode.localeCompare(b.mapCode));
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
