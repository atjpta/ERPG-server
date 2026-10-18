import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { partyDirectoryService } from "@/rooms/party/services/party-directory.service.js";
import { PartyNotice } from "@/rooms/party/types/party-message.type.js";
import { Command } from "@colyseus/command";
import { publishMembership } from "@/rooms/party/services/party-membership.js";
import { broadcastNotice } from "@/rooms/party/services/party-notify.js";

export class OnJoinPartyCommand extends Command<PartyRoom, { client: PlayerClient }> {
    async execute({ client }: { client: PlayerClient }) {
        const { playerId } = client.auth;
        if (this.room.sessionOf.has(playerId)) throw new Error("Already connected to this party");

        const isFounder = this.room.state.has(playerId);
        if (!isFounder) {
            const existing = await partyDirectoryService.getPartyRoomId(playerId);
            if (existing && existing !== this.room.roomId)
                throw new Error("Already in another party");
            const error = this.room.state.joinWithInvite(playerId, this.clock.currentTime);
            if (error) throw new Error(`Cannot join party: ${error}`);
        }
        this.room.sessionOf.set(playerId, client.sessionId);
        // Room phụ: không đá kết nối world cùng player.
        await this.room.registerPlayer(client);
        await partyDirectoryService.setPartyRoomId(playerId, this.room.roomId);

        const worldRoomId =
            this.room.worldRoomOf.get(playerId) ??
            (await partyDirectoryService.getWorldRoomId(playerId));
        if (worldRoomId) {
            this.room.worldRoomOf.set(playerId, worldRoomId);
            void publishMembership(this.room, worldRoomId, playerId, this.room.roomId);
        }
        if (!isFounder) {
            broadcastNotice(
                this.room,
                PartyNotice.MEMBER_JOINED,
                this.room.state.nameOf(playerId),
                playerId
            );
        }
    }
}
