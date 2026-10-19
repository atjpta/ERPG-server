import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { callRoom } from "@/core/rooms/room.integration.js";
import { RequestJoinPartyCommand } from "@/rooms/party/commands/request-join.party.command.js";
import type { ErrorCode } from "@/core/types/result.type.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { isFail } from "@/core/utils/result.util.js";
import { sendFail, sendOk } from "@/core/utils/room-send.util.js";
import {
    PartyErrorCode,
    PartyNotice,
    type PartyNoticeMessage,
} from "@/rooms/party/party.shared.js";
import { playerPartyWorldService } from "@/rooms/world/modules/players/services/player-party.world.service.js";
import { PlayerTargetSchema } from "@/rooms/world/modules/players/validators/player-target.world.validator.js";
import { WorldClientMessage, WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface PartyPayload {
    client: PlayerClient;
    payload: unknown;
}

@SdkMessage({
    replies: [WorldMessage.PARTY_NOTICE],
    errors: [
        PartyErrorCode.PARTY_ALREADY_MEMBER,
        PartyErrorCode.PARTY_SELF_TARGET,
        PartyErrorCode.PARTY_TARGET_NOT_IN_PARTY,
        PartyErrorCode.PARTY_FULL,
        PlayerErrorCode.PLAYER_NOT_HERE,
        CommonCode.ROOM_UNAVAILABLE,
    ],
    note: "Payload sai thì server im lặng.",
})
export class PartyRequestJoinWorldCommand extends Command<WorldRoom, PartyPayload> {
    static readonly message = WorldClientMessage.PARTY_REQUEST_JOIN;

    async execute({ client, payload }: PartyPayload) {
        const parsed = PlayerTargetSchema.safeParse(payload);
        const player = this.room.state.players.get(client.auth.playerId);
        if (!parsed.success || !player) return;
        const targetPlayerId = parsed.data.playerId;

        const refuse = (code: ErrorCode) => sendFail(client, WorldMessage.PARTY_NOTICE, code);
        if (
            player.partyRoomId &&
            (await playerPartyWorldService.isPartyRoomListed(player.partyRoomId))
        ) {
            return refuse(PartyErrorCode.PARTY_ALREADY_MEMBER);
        }
        const target = [...this.room.state.players.values()].find(
            (other) => other.id === targetPlayerId
        );
        if (!target) return refuse(PlayerErrorCode.PLAYER_NOT_HERE);
        if (target.id === player.id) return refuse(PartyErrorCode.PARTY_SELF_TARGET);
        if (!target.partyRoomId) return refuse(PartyErrorCode.PARTY_TARGET_NOT_IN_PARTY);

        const result = await callRoom(target.partyRoomId, RequestJoinPartyCommand, {
            fromPlayerId: player.id,
            fromName: player.name,
        });
        if (isFail(result)) {
            refuse(
                result.code === CommonCode.ROOM_UNAVAILABLE
                    ? PartyErrorCode.PARTY_TARGET_NOT_IN_PARTY
                    : result.code
            );
            return;
        }
        const message: PartyNoticeMessage = { notice: PartyNotice.JOIN_REQUEST_SENT };
        sendOk(client, WorldMessage.PARTY_NOTICE, message);
    }
}
