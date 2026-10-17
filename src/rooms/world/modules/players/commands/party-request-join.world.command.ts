import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { partyRoomRemote } from "@/rooms/party/party.remote.js";
import { PartyNoticeCode, type PartyNoticeMessage } from "@/rooms/party/party.shared.js";
import { playerPartyWorldService } from "@/rooms/world/modules/players/services/player-party.world.service.js";
import { PlayerTargetSchema } from "@/rooms/world/modules/players/validators/player-target.world.validator.js";
import { WorldClientMessage, WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface PartyPayload {
    client: PlayerClient;
    payload: unknown;
}

export class PartyRequestJoinWorldCommand extends Command<WorldRoom, PartyPayload> {
    static readonly message = WorldClientMessage.PARTY_REQUEST_JOIN;

    async execute({ client, payload }: PartyPayload) {
        const parsed = PlayerTargetSchema.safeParse(payload);
        const player = this.room.state.players.get(client.sessionId);
        if (!parsed.success || !player) return;
        const room = this.room;
        const targetPlayerId = parsed.data.playerId;

        const notice = (code: PartyNoticeCode) => {
            const message: PartyNoticeMessage = { code };
            client.send(WorldMessage.PARTY_NOTICE, message);
        };
        if (
            player.partyRoomId &&
            (await playerPartyWorldService.isPartyRoomListed(player.partyRoomId))
        ) {
            return notice(PartyNoticeCode.ALREADY_MEMBER);
        }
        const target = [...room.state.players.values()].find(
            (other) => other.id === targetPlayerId
        );
        if (!target) return notice(PartyNoticeCode.TARGET_NOT_HERE);
        if (target.id === player.id) return notice(PartyNoticeCode.SELF_TARGET);
        if (!target.partyRoomId) return notice(PartyNoticeCode.TARGET_NOT_IN_PARTY);

        const result = await partyRoomRemote(target.partyRoomId).requestJoin(
            player.id,
            player.name
        );
        notice(result ?? PartyNoticeCode.TARGET_NOT_IN_PARTY);
    }
}
