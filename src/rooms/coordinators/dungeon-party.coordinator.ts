import { callRoom } from "@/core/rooms/room.integration.js";
import { PrepareDungeonPartyCommand } from "@/rooms/party/commands/prepare-dungeon.party.command.js";
import { NotifyDungeonDeniedPartyCommand } from "@/rooms/party/commands/notify-dungeon-denied.party.command.js";
import { PartyCheckDungeonWorldCommand } from "@/rooms/world/modules/dungeons/commands/party-check-dungeon.world.command.js";
import { PartyEnterDungeonWorldCommand } from "@/rooms/world/modules/dungeons/commands/party-enter-dungeon.world.command.js";
import type { ErrorCode } from "@/core/types/result.type.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import type { Result } from "@/core/types/result.type.js";
import { fail, isFail, ok } from "@/core/utils/result.util.js";
import { partyDirectoryService } from "@/rooms/party/services/party-directory.service.js";
import type {
    DungeonPartyMember,
    DungeonPartyRequest,
} from "@/rooms/party/types/party-room.type.js";
import { randomUUID } from "node:crypto";

const DENY_REASONS = new Set<ErrorCode>([
    PlayerErrorCode.LEVEL_TOO_LOW,
    PlayerErrorCode.PLAYER_DEAD,
    MapErrorCode.DUNGEON_ALREADY_IN,
]);

/** Lý do báo cho party: ngoài 3 lý do rõ ràng thì coi như thành viên không có mặt. */
const failureReason = (code: ErrorCode) =>
    DENY_REASONS.has(code) ? code : PlayerErrorCode.PLAYER_OFFLINE;

/** Coordinates room-owned checks; neither room knows its peer's implementation. */
export class DungeonPartyCoordinator {
    /**
     * Cả party vào dungeon: party kiểm tra nhóm, world của từng thành viên kiểm lại rồi mới ra lệnh vào.
     * Thành công = đã ra lệnh `mapChange` cho cả nhóm; thất bại = `code` (xem `ErrorCode`).
     */
    async launch(partyRoomId: string, request: DungeonPartyRequest): Promise<Result> {
        const plan = await callRoom(partyRoomId, PrepareDungeonPartyCommand, request);
        if (isFail(plan)) return plan;
        const { members } = plan.data;

        const checks = await Promise.all(
            members.map(async (member) => ({
                member,
                result: member.worldRoomId
                    ? await callRoom(member.worldRoomId, PartyCheckDungeonWorldCommand, {
                          playerId: member.playerId,
                          dungeonCode: request.code,
                          retry: request.retry,
                      })
                    : fail(PlayerErrorCode.PLAYER_OFFLINE),
            }))
        );
        if (await this.denied(partyRoomId, request.code, checks))
            return fail(MapErrorCode.DUNGEON_DENIED);

        const instanceId = randomUUID();
        await partyDirectoryService.setDungeonExpectation(instanceId, {
            dungeonCode: request.code,
            leaderPlayerId: request.leaderPlayerId,
            expected: members.map((m) => m.playerId),
        });
        const results = await Promise.all(
            members.map(async (member) => ({
                member,
                result: await callRoom(member.worldRoomId!, PartyEnterDungeonWorldCommand, {
                    playerId: member.playerId,
                    dungeonCode: request.code,
                    instanceId,
                    spawnId: request.spawnId,
                    retry: request.retry,
                }),
            }))
        );
        if (await this.denied(partyRoomId, request.code, results))
            return fail(MapErrorCode.DUNGEON_DENIED);
        return ok();
    }

    /** Có ai không đạt thì báo cả party và trả `true`. */
    private async denied(
        partyRoomId: string,
        dungeonCode: string,
        results: { member: DungeonPartyMember; result: Result }[]
    ) {
        const failures = results.flatMap(({ member, result }) =>
            result.success
                ? []
                : [
                      {
                          playerId: member.playerId,
                          name: member.name,
                          reason: failureReason(result.code),
                      },
                  ]
        );
        if (!failures.length) return false;
        await callRoom(partyRoomId, NotifyDungeonDeniedPartyCommand, { dungeonCode, failures });
        return true;
    }
}
export const dungeonPartyCoordinator = new DungeonPartyCoordinator();
