import type { Result } from "@/core/types/result.type.js";
import type { DungeonLaunchRequest } from "@/rooms/runtime/modules/dungeon/types/dungeon-launch.type.js";

/** Điều world room cho phép room khác nhờ làm (qua `RoomRuntimeService`). */
export interface WorldRoomPort {
    /** `playerId` (đang ở room này) có vào được dungeon không. */
    checkDungeonEntry(request: {
        playerId: string;
        dungeonCode: string;
        retry: boolean;
    }): Promise<Result>;
    /** Đưa `playerId` vào instance dungeon (thành công = đã gửi `mapChange` cho client). */
    enterDungeon(request: {
        playerId: string;
        dungeonCode: string;
        instanceId: string;
        spawnId: string;
        retry: boolean;
    }): Promise<Result>;
}

/** Điều global room cho phép room khác nhờ làm. */
export interface GlobalRoomPort {
    /** Chủ party muốn cả party vào dungeon (lần đầu hoặc "đi lại" sau khi clear). */
    launchDungeon(request: DungeonLaunchRequest): Promise<Result>;
}
