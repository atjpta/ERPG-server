import type { GlobalRoom } from "@/rooms/global/global.room.js";
import { PartyNotice } from "@/rooms/global/modules/party/enums/party-notice.enum.js";
import { playerDataGlobalService } from "@/rooms/global/modules/player-data/services/player-data.global.service.js";
import { worldRegistryGlobalService } from "@/rooms/global/modules/world-registry/services/world-registry.global.service.js";
import { Command } from "@colyseus/command";
import { partyGlobalService } from "@/rooms/global/modules/party/services/party.global.service.js";

/** World room làm mới mỗi 30 giây; quá hạn này = coi như offline. */
const PRESENCE_MAX_AGE_MS = 90_000;
/** Lưới an toàn: thành viên không có vị trí world quá lâu (đổi map mà không bao giờ vào được room mới) thì rút khỏi party. Rời world hẳn thì đã ra khỏi party ngay ở `DetachWorld`. */
const PARTY_OFFLINE_KICK_MS = 120_000;

/**
 * Timer 30 giây: dọn vị trí player của world room đã chết không kịp detach, và đưa ra khỏi party những thành
 * viên không còn kết nối global lẫn vị trí (ví dụ party tạo cho người chơi chưa kết nối global rồi bỏ đi).
 */
export class PruneRegistryGlobalCommand extends Command<GlobalRoom> {
    execute() {
        const { room } = this;
        // Presence quá hạn bị dọn: người đó coi như đã ra khỏi world (xem `removeLongOffline`).
        const pruned = worldRegistryGlobalService.pruneStaleWorld(
            room,
            this.clock.currentTime,
            PRESENCE_MAX_AGE_MS
        );
        for (const playerId of pruned) void playerDataGlobalService.releaseIfIdle(room, playerId);
        for (const party of [...room.state.parties.get()]) {
            for (const playerId of party.joinOrder) {
                if (
                    room.sessionOf.has(playerId) ||
                    worldRegistryGlobalService.isInWorld(room, playerId)
                )
                    continue;
                partyGlobalService.removeMember(room, party, playerId, PartyNotice.MEMBER_LEFT);
            }
        }
        this.removeLongOffline();
    }

    private removeLongOffline() {
        const { room } = this;
        const now = this.clock.currentTime;
        for (const party of [...room.state.parties.get()]) {
            const { offlineSince } = party;
            for (const playerId of offlineSince.keys()) {
                if (!party.hasMember(playerId)) offlineSince.delete(playerId);
            }
            for (const playerId of party.joinOrder) {
                if (worldRegistryGlobalService.isInWorld(room, playerId)) {
                    offlineSince.delete(playerId);
                    continue;
                }
                const since = offlineSince.get(playerId) ?? now;
                offlineSince.set(playerId, since);
                if (now - since >= PARTY_OFFLINE_KICK_MS) {
                    offlineSince.delete(playerId);
                    partyGlobalService.removeMember(room, party, playerId, PartyNotice.MEMBER_LEFT);
                }
            }
        }
    }
}
