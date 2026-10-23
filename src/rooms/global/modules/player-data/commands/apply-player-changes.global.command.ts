import type { Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import { playerDataGlobalService } from "@/rooms/global/modules/player-data/services/player-data.global.service.js";
import type {
    PlayerChangeEntry,
    PlayerChangeEntryResult,
} from "@/rooms/global/modules/player-data/types/player-data.type.js";
import { Command } from "@colyseus/command";

interface Payload {
    entries: PlayerChangeEntry[];
}

/**
 * RPC từ world: áp dụng các thay đổi túi / điểm phát sinh ở world (item rơi, thưởng quest, bình thuốc, điểm lên
 * level). Mỗi entry nguyên tử và idempotent theo `eventId`; kết quả theo từng entry.
 */
export class ApplyPlayerChangesGlobalCommand extends Command<GlobalRoom, Payload> {
    result: Result<PlayerChangeEntryResult[]> = Response.error(CommonCode.ROOM_UNAVAILABLE);

    async execute({ entries }: Payload) {
        this.result = Response.success(
            await playerDataGlobalService.applyEntries(this.room, entries)
        );
    }
}
