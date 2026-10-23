import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import { FriendRuntimeService } from "@/rooms/runtime/modules/friend/services/friend-runtime.service.js";
import { PartyRuntimeService } from "@/rooms/runtime/modules/party/services/party-runtime.service.js";
import { PlayerRuntimeService } from "@/rooms/runtime/modules/player/services/player-runtime.service.js";
import type { GlobalRoomPort, WorldRoomPort } from "@/rooms/runtime/types/room-port.type.js";
import type { DungeonLaunchRequest } from "@/rooms/runtime/modules/dungeon/types/dungeon-launch.type.js";

/**
 * Runtime chung của MỘT game server: giữ dữ liệu chạy mà các room của server đó dùng chung (`players`, `parties`, `friends`) và là nơi
 * duy nhất để các room của nó nói chuyện với nhau — mỗi room đăng ký "cổng" của mình lúc tạo (`registerWorld` / `registerGlobal`) và gỡ khi
 * đóng; room khác gọi qua đây, không import room hay service của nhau. Room đích không còn thì trả `ROOM_UNAVAILABLE`.
 * Mỗi game server một instance (`roomRuntimes.of(serverId)`) nên một process chạy được một hay nhiều server.
 */
export class RoomRuntimeService {
    /** Người chơi đang online (ví, túi, vị trí...): world và global cùng đọc / ghi. */
    readonly players = new PlayerRuntimeService();
    /** Mọi party của game server. */
    readonly parties = new PartyRuntimeService();
    /** Id bạn bè của những người đang kết nối global (để đẩy presence). */
    readonly friends = new FriendRuntimeService();

    private readonly worlds = new Map<string, WorldRoomPort>();
    private globalPort?: GlobalRoomPort;

    constructor(readonly serverId: string) {}

    /** Đăng ký cổng của world room `roomId`; trả hàm gỡ. */
    registerWorld(roomId: string, port: WorldRoomPort): () => void {
        this.worlds.set(roomId, port);
        return () => void this.worlds.delete(roomId);
    }

    /** Đăng ký cổng của global room của game server này; trả hàm gỡ. */
    registerGlobal(port: GlobalRoomPort): () => void {
        this.globalPort = port;
        return () => {
            if (this.globalPort === port) this.globalPort = undefined;
        };
    }

    checkDungeonEntry(
        worldRoomId: string,
        request: Parameters<WorldRoomPort["checkDungeonEntry"]>[0]
    ): Promise<Result> {
        const world = this.worlds.get(worldRoomId);
        return world ? world.checkDungeonEntry(request) : this.unavailable();
    }

    enterDungeon(
        worldRoomId: string,
        request: Parameters<WorldRoomPort["enterDungeon"]>[0]
    ): Promise<Result> {
        const world = this.worlds.get(worldRoomId);
        return world ? world.enterDungeon(request) : this.unavailable();
    }

    launchDungeon(request: DungeonLaunchRequest): Promise<Result> {
        return this.globalPort ? this.globalPort.launchDungeon(request) : this.unavailable();
    }

    private unavailable(): Promise<Result> {
        return Promise.resolve(Response.error(CommonCode.ROOM_UNAVAILABLE));
    }
}

/** Các runtime của những game server mà process này phụ trách, theo `serverId`. */
export class RoomRuntimeRegistry {
    private readonly runtimes = new Map<string, RoomRuntimeService>();

    /** Runtime của `serverId` (tạo khi cần). */
    of(serverId: string): RoomRuntimeService {
        let runtime = this.runtimes.get(serverId);
        if (!runtime) {
            runtime = new RoomRuntimeService(serverId);
            this.runtimes.set(serverId, runtime);
        }
        return runtime;
    }

    /** Process này có phụ trách game server `serverId` không (đã `pinGameServers`). */
    has(serverId: string): boolean {
        return this.runtimes.has(serverId);
    }

    all(): IterableIterator<RoomRuntimeService> {
        return this.runtimes.values();
    }

    /** Tắt process: lưu mọi người chơi của mọi server đang giữ. */
    async flushAll(): Promise<void> {
        await Promise.all([...this.runtimes.values()].map((runtime) => runtime.players.flushAll()));
    }
}

export const roomRuntimes = new RoomRuntimeRegistry();
