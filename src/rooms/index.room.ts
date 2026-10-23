import { cacheService } from "@/core/cache/cache.service.js";
import { env } from "@/configs/env.config.js";
import { DEFAULT_GAME_SERVER_CODE } from "@/modules/auth/constants/game-server.constant.js";
import { GameServerStatus } from "@/modules/auth/enums/game-server.enum.js";
import { GameServerRepo } from "@/modules/auth/repositories/game-server.repository.js";
import { roomRuntimes } from "@/rooms/runtime/runtime.room.js";
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

/** Game server mà process này phụ trách. */
export interface PinnedGameServer {
    id: string;
    code: string;
}

const pinned = new Map<string, PinnedGameServer>();

/** Các game server của process này (rỗng trước khi `pinGameServers` chạy lúc khởi động). */
export const pinnedGameServers = (): PinnedGameServer[] => [...pinned.values()];

/**
 * Ghim process vào MỘT HOẶC NHIỀU game server: env `GAME_SERVER_CODES` (danh sách cách nhau bằng dấu phẩy), không có thì `GAME_SERVER_CODE`,
 * không có nữa thì server mặc định. Mỗi server có một `RoomRuntimeService` riêng (`roomRuntimes.of(serverId)`), nên mọi room của một
 * server dùng chung một nguồn dữ liệu người chơi trong bộ nhớ dù process chạy một hay nhiều server. Gọi ngay sau khi nối Postgres, trước khi
 * nhận kết nối; thiếu hoặc `OFFLINE` thì ném lỗi (khởi động thất bại).
 */
export async function pinGameServers(): Promise<PinnedGameServer[]> {
    const codes = [
        ...new Set(
            (env.GAME_SERVER_CODES ?? env.GAME_SERVER_CODE ?? DEFAULT_GAME_SERVER_CODE)
                .split(",")
                .map((code) => code.trim())
                .filter(Boolean)
        ),
    ];
    for (const code of codes) {
        const server = await GameServerRepo.findByCode({ code });
        if (!server) {
            throw new Error(
                `Game server "${code}" does not exist: set GAME_SERVER_CODES or run yarn seed`
            );
        }
        if (server.status === GameServerStatus.OFFLINE) {
            throw new Error(
                `Game server "${code}" is OFFLINE: this process would have nothing to host`
            );
        }
        pinned.set(server.id, { id: server.id, code: server.code });
        roomRuntimes.of(server.id);
        console.info(`[Server] process hosts game server ${server.code} (${server.id})`);
    }
    return pinnedGameServers();
}

/**
 * Sau khi dựng room: nếu một process KHÁC đang giữ room `global` của một server của process này (hai process cùng ghim một server, hoặc bản
 * ghi cũ của process đã chết) thì dữ liệu người chơi sẽ bị chia đôi giữa hai process — báo lỗi to để người vận hành xử lý. Không thoát vì
 * bản ghi cũ của process vừa crash có thể còn trong Redis một lúc.
 */
export async function warnIfServerHostedElsewhere(): Promise<void> {
    if (!env.REDIS_URI) return;
    for (const server of pinned.values()) {
        const rooms = await matchMaker.query({
            name: GLOBAL_ROOM_NAME,
            serverId: server.id,
        } as never);
        const foreign = rooms.filter(
            (room) => room.processId && room.processId !== matchMaker.processId
        );
        if (foreign.length > 0) {
            console.error(
                `[Server] game server ${server.code} is also hosted by process ${foreign[0].processId}: ` +
                    "player data is held in memory per process, so only ONE process may run each game server."
            );
        }
    }
}

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
 * Dựng sẵn room khi server khởi động (gọi sau `listen`): mỗi game server của process này (xem `pinGameServers`) có một global room và
 * một room kênh cho mỗi map đang mở, trừ dungeon (room dungeon chỉ có khi cả party vào). Room đã có thì bỏ qua;
 * khoá trong cache giữ cho nhiều process không cùng tạo. Map mở thêm sau đó thì room tạo lười như cũ.
 * Log theo từng game server: room global rồi từng room map (roomId + trạng thái) ngay khi room đó xong, cuối cùng là
 * các map dungeon bỏ qua và dòng tổng.
 */
export async function InitRoom(): Promise<void> {
    const servers = pinnedGameServers();
    if (servers.length === 0) {
        throw new Error("InitRoom needs pinned game servers: call pinGameServers first");
    }
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
