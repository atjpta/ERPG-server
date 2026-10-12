import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import { PartyNoticeCode, type PartyNoticeMessage } from "@/rooms/party/schema/party.message.js";
import { toEquipmentsMessage } from "@/rooms/world/services/inventory.world.service.js";
import {
    WorldMessage,
    type PlayerViewMessage,
} from "@/rooms/world/world.message.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/** Xem thông tin (trang bị + chỉ số) của người chơi khác đang cùng map — chỉ đọc, không đổi gì. */
export class PlayerViewWorldService {
    view(room: WorldRoom, client: PlayerClient, targetPlayerId: string): void {
        const target = [...room.state.players.values()].find(
            (player) => player.id === targetPlayerId
        );
        if (!target) {
            const notice: PartyNoticeMessage = { code: PartyNoticeCode.TARGET_NOT_HERE };
            client.send(WorldMessage.PARTY_NOTICE, notice);
            return;
        }
        const summary = target.getAttributeSummary();
        const message: PlayerViewMessage = {
            ok: true,
            playerId: target.id,
            name: target.name,
            level: target.level,
            classCode: target.classCode,
            baseClassCode: target.baseClassCode,
            equipments: toEquipmentsMessage(target.equipments),
            attributes: summary.attributes,
            stats: summary.stats,
        };
        client.send(WorldMessage.PLAYER_VIEW, message);
    }
}

export const playerViewWorldService = new PlayerViewWorldService();
