import type { GlobalRoom } from "@/rooms/global/global.room.js";
import { PartyNotice } from "@/rooms/global/modules/party/enums/party-notice.enum.js";
import { worldRegistryGlobalService } from "@/rooms/global/modules/world-registry/services/world-registry.global.service.js";
import { Command } from "@colyseus/command";
import { partyGlobalService } from "@/rooms/global/modules/party/services/party.global.service.js";

/** Lưới an toàn: thành viên không có vị trí world quá lâu (đổi map mà không bao giờ vào được room mới) thì rút khỏi party. Rời world hẳn thì đã ra khỏi party ngay lúc rời. */
const PARTY_OFFLINE_KICK_MS = 120_000;

/**
 * Timer 30 giây: đưa ra khỏi party những thành viên không còn kết nối global lẫn vị trí world (ví dụ party tạo cho
 * người chơi chưa kết nối global rồi bỏ đi) và những người vắng world quá `PARTY_OFFLINE_KICK_MS`.
 */
export class SweepOfflineMembersGlobalCommand extends Command<GlobalRoom> {
    execute() {
        const { room } = this;
        const now = this.clock.currentTime;
        for (const party of [...this.room.runtime.parties.get()]) {
            const { offlineSince } = party;
            for (const playerId of offlineSince.keys()) {
                if (!party.hasMember(playerId)) offlineSince.delete(playerId);
            }
            for (const playerId of party.joinOrder) {
                if (worldRegistryGlobalService.isInWorld(room, playerId)) {
                    offlineSince.delete(playerId);
                    continue;
                }
                if (!room.sessionOf.has(playerId)) {
                    partyGlobalService.removeMember(room, party, playerId, PartyNotice.MEMBER_LEFT);
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
