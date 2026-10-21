import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { callRoom } from "@/core/rooms/room.integration.js";
import { RequestJoinPartyCommand } from "@/rooms/party/commands/request-join.party.command.js";
import type { ErrorCode } from "@/core/types/result.type.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { isFail } from "@/core/utils/result.util.js";
import {
    PartyErrorCode,
    PartyNotice,
    type PartyNoticeMessage,
} from "@/rooms/party/party.shared.js";
import { playerPartyWorldService } from "@/rooms/world/modules/players/services/player-party.world.service.js";
import { PlayerTargetSchema } from "@/rooms/world/modules/players/validators/player-target.world.validator.js";
import { WorldClientMessage, WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { PlayerWorldCommand } from "@/rooms/world/commands/player.world.command.js";

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
export class PartyRequestJoinWorldCommand extends PlayerWorldCommand<
    PartyPayload,
    typeof PlayerTargetSchema
> {
    static readonly message = WorldClientMessage.PARTY_REQUEST_JOIN;

    protected override readonly validateSchema = PlayerTargetSchema;

    private target!: PlayerWorldState;

    validate({ client }: PartyPayload) {
        const refuse = (code: ErrorCode) => {
            client.sendError(WorldMessage.PARTY_NOTICE, code);
            return false;
        };
        const target = [...this.room.state.players.values()].find(
            (other) => other.id === this.body.playerId
        );
        if (!target) return refuse(PlayerErrorCode.PLAYER_NOT_HERE);
        if (target.id === this.player.id) return refuse(PartyErrorCode.PARTY_SELF_TARGET);
        if (!target.partyRoomId) return refuse(PartyErrorCode.PARTY_TARGET_NOT_IN_PARTY);

        this.target = target;
        return true;
    }

    async execute({ client }: PartyPayload) {
        const { player, target } = this;
        const refuse = (code: ErrorCode) => client.sendError(WorldMessage.PARTY_NOTICE, code);
        // Cần await (đọc directory) nên không nằm trong validate().
        if (
            player.partyRoomId &&
            (await playerPartyWorldService.isPartyRoomListed(player.partyRoomId))
        ) {
            return refuse(PartyErrorCode.PARTY_ALREADY_MEMBER);
        }
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
        client.sendSuccess(WorldMessage.PARTY_NOTICE, message);
    }
}
