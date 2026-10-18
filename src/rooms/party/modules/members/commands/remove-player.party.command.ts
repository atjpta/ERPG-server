import { releasePlayer } from "@/rooms/party/services/party-membership.js";
import { broadcastNotice } from "@/rooms/party/services/party-notify.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { PartyNotice } from "@/rooms/party/types/party-message.type.js";
import { Command } from "@colyseus/command";

interface Payload {
    playerId: string;
    code: PartyNotice;
    /** Đá kết nối party của player (false khi chính kết nối đó vừa rớt). */
    kickSocket?: boolean;
}

/** Bỏ `playerId` khỏi party (tự rời / bị kick / offline), dọn con trỏ và báo cho phần còn lại. */
export class RemovePlayerPartyCommand extends Command<PartyRoom, Payload> {
    async execute({ playerId, code, kickSocket = true }: Payload) {
        const { room } = this;
        const { state } = room;
        if (!state.has(playerId)) return;
        const name = state.nameOf(playerId);
        const newLeaderId = state.leave(playerId);

        const sessionId = room.sessionOf.get(playerId);
        room.sessionOf.delete(playerId);
        await releasePlayer(room, playerId);
        if (kickSocket && sessionId) room.clients.getById(sessionId)?.leave();
        if (room.disbanded) return;

        if (state.size === 0) {
            room.disbanded = true;
            void room.disconnect();
            return;
        }
        broadcastNotice(room, code, name, playerId);
        if (newLeaderId) {
            broadcastNotice(room, PartyNotice.LEADER_CHANGED, state.nameOf(newLeaderId));
        }
    }
}
