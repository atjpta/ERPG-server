import { cacheService } from "@/core/cache/cache.service.js";
import { gameServerService } from "@/modules/auth/services/game-server.service.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { mapService } from "@/modules/maps/services/map.service.js";
import { GlobalRoom } from "@/rooms/global/global.room.js";
import { GLOBAL_ROOM_NAME } from "@/rooms/global/types/global-room.type.js";
import type { WorldRoomOptions } from "@/rooms/world/types/world-room.type.js";
import { WorldRoom } from "@/rooms/world/world.room.js";
import { defineRoom, matchMaker } from "colyseus";

const WORLD_ROOM_NAME = "world";
/** Khoá tạo room map: tự hết hạn nếu process giữ khoá chết giữa chừng. */
const CREATE_LOCK_TTL_SEC = 30;

export const createRooms = () => {
    return {
        world: defineRoom(WorldRoom).filterBy(["serverId", "mapCode"]),
        // Mỗi lượt dungeon là 1 instance riêng (`instanceId` do server cấp qua `mapChange`).
        dungeon: defineRoom(WorldRoom).filterBy(["serverId", "instanceId"]),
        // Mỗi game server một global room (chat, party, presence, điều phối dungeon): `joinOrCreate("global", { serverId })`.
        global: defineRoom(GlobalRoom).filterBy(["serverId"]),
    };
};

/** Kết quả dựng sẵn room của một map: `locked` = process khác đang giữ khoá tạo. */
type WorldRoomStatus = "new" | "existing" | "locked" | "failed";

interface WorldRoomResult {
    mapCode: string;
    status: WorldRoomStatus;
    roomId?: string;
}

/**
 * Dựng sẵn room khi server khởi động (gọi sau `listen`): mỗi game server chưa `OFFLINE` có một global room và
 * một room kênh cho mỗi map đang mở, trừ dungeon (room dungeon chỉ có khi cả party vào). Room đã có thì bỏ qua;
 * khoá trong cache giữ cho nhiều process không cùng tạo. Map mở thêm sau đó thì room tạo lười như cũ.
 * Log theo từng game server: room global rồi từng room map (roomId + trạng thái) ngay khi room đó xong, cuối cùng là
 * các map dungeon bỏ qua và dòng tổng.
 */
export async function InitRoom(): Promise<void> {
    const servers = await gameServerService.listNotOffline();
    const activeMaps = await mapService.listActive();
    const maps = activeMaps.filter((map) => map.type !== MapType.DUNGEON);
    const dungeonCodes = activeMaps
        .filter((map) => map.type === MapType.DUNGEON)
        .map((m) => m.code);
    console.info(`[Rooms] init: ${servers.length} server, ${maps.length} map thường`);

    const width = Math.max(0, ...maps.map((map) => map.code.length));

    for (const server of servers) {
        console.info(`[Rooms] server ${server.code} (${server.id})`);
        // roomId của global room là `server.id`; đã có thì Colyseus trả lại room đó thay vì tạo thêm.
        let globalRoomId: string | undefined;
        try {
            globalRoomId = (await matchMaker.createRoom(GLOBAL_ROOM_NAME, { serverId: server.id }))
                .roomId;
        } catch (error) {
            console.error(`[Rooms] cannot create global room (server ${server.code}):`, error);
        }
        console.info(`  global  ${globalRoomId ?? "-"}${globalRoomId ? "" : "  failed"}`);

        const results: WorldRoomResult[] = [];
        for (const map of maps) {
            const result: WorldRoomResult = { mapCode: map.code, status: "failed" };
            results.push(result);
            const lockKey = `world:room:create:${server.id}:${map.code}`;
            if (!(await cacheService.setIfAbsent(lockKey, true, CREATE_LOCK_TTL_SEC))) {
                result.status = "locked";
                logWorldRoom(result, width);
                continue;
            }
            try {
                // `query` (không phải `findOneRoomAvailable`) để room đang đầy cũng tính là đã có.
                const existing = await matchMaker.query({
                    name: WORLD_ROOM_NAME,
                    serverId: server.id,
                    mapCode: map.code,
                } as never);
                if (existing.length > 0) {
                    result.status = "existing";
                    result.roomId = existing[0].roomId;
                } else {
                    const options: WorldRoomOptions = {
                        serverId: server.id,
                        mapCode: map.code,
                        persistent: true,
                    };
                    const room = await matchMaker.createRoom(WORLD_ROOM_NAME, options);
                    result.status = "new";
                    result.roomId = room.roomId;
                }
            } catch (error) {
                console.error(
                    `[Rooms] cannot create world room "${map.code}" (server ${server.code}):`,
                    error
                );
            } finally {
                await cacheService.del(lockKey);
            }
            // In ngay khi room này xong, không đợi cả server.
            logWorldRoom(result, width);
        }

        if (dungeonCodes.length > 0) {
            console.info(`  dungeon (tạo khi cả party vào): ${dungeonCodes.join(", ")}`);
        }
        const count = (status: WorldRoomStatus) =>
            results.filter((result) => result.status === status).length;
        console.info(
            `  tổng: ${maps.length} map — ${count("new")} mới, ${count("existing")} đã có, ` +
                `${count("locked")} đang được process khác tạo, ${count("failed")} lỗi`
        );
    }
}

const logWorldRoom = ({ mapCode, status, roomId }: WorldRoomResult, width: number) =>
    console.info(`  world   ${mapCode.padEnd(width)}  ${roomId ?? "-"}  ${status}`);
