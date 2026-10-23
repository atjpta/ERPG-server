import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import type { CommandGuard } from "@/core/rooms/player.command.js";
import { Response } from "@/core/utils/response.util.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";
import type { PartyRuntime } from "@/rooms/runtime/modules/party/runtime/party-runtime.js";
import { PartyErrorCode } from "@/rooms/runtime/modules/party/enums/party-error-code.enum.js";
import type { z } from "zod";

export interface PartyCommandPayload {
    client: PlayerClient;
    payload?: unknown;
}

/**
 * Base của command thao tác trên party hiện tại của người gửi: guard bảo đảm họ đang ở một party
 * (`PARTY_NOT_MEMBER`) và, nếu `leaderOnly`, họ là chủ (`PARTY_NOT_LEADER`). Command con dùng `this.party`.
 */
export abstract class PartyMemberGlobalCommand<
    TSchema extends z.ZodType = z.ZodUndefined,
> extends PlayerGlobalCommand<PartyCommandPayload, TSchema> {
    protected party!: PartyRuntime;
    /** Chỉ chủ party làm được. */
    protected readonly leaderOnly: boolean = false;

    protected override readonly guards: readonly CommandGuard<this>[] = [
        (command) => {
            const party = command.room.runtime.parties.getPartyByPlayerId(command.player.playerId);
            if (!party) return Response.error(PartyErrorCode.PARTY_NOT_MEMBER);
            command.party = party;
            if (command.leaderOnly && !party.isLeader(command.player.playerId)) {
                return Response.error(PartyErrorCode.PARTY_NOT_LEADER);
            }
        },
    ];
}
