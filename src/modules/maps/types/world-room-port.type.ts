import type { Response } from "@/core/response/response.js";

/** Điều world room cho phép room khác nhờ làm (qua `rooms/bus`, `rpc` của world room). */
export interface WorldRoomPort {
    /** `playerId` (đang ở room này) có vào được dungeon không. */
    checkDungeonEntry(request: {
        playerId: string;
        dungeonCode: string;
        retry: boolean;
    }): Promise<Response>;
    /** Đưa `playerId` vào instance dungeon (thành công = đã gửi `mapChange` cho client). */
    enterDungeon(request: {
        playerId: string;
        dungeonCode: string;
        instanceId: string;
        spawnId: string;
        retry: boolean;
    }): Promise<Response>;
}
