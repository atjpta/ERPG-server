import type { DungeonLaunchRequest } from "@/rooms/runtime/modules/dungeon/types/dungeon-launch.type.js";
import type { ErrorCode, Result } from "@/core/types/result.type.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import type { PartyDungeonDeniedMessage } from "@/rooms/global/modules/dungeon-launch/interfaces/dungeon.global.message.js";
import type { PartyRuntime } from "@/rooms/runtime/modules/party/runtime/party-runtime.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import { PartyErrorCode } from "@/rooms/runtime/modules/party/enums/party-error-code.enum.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { Response } from "@/core/utils/response.util.js";
import { dungeonExpectationService } from "@/rooms/runtime/modules/dungeon/services/dungeon-expectation.service.js";
import { generateEntityId } from "@/core/entities/base.entity.js";
import { partyGlobalService } from "@/rooms/global/modules/party/services/party.global.service.js";
import { partyNotifyGlobalService } from "@/rooms/global/modules/party/services/party-notify.global.service.js";
import { worldRegistryGlobalService } from "@/rooms/global/modules/world-registry/services/world-registry.global.service.js";

const DENY_REASONS = new Set<ErrorCode>([
    PlayerErrorCode.LEVEL_TOO_LOW,
    PlayerErrorCode.PLAYER_DEAD,
    MapErrorCode.DUNGEON_ALREADY_IN,
]);

/** Lý do báo cho party: ngoài 3 lý do rõ ràng thì coi như thành viên không có mặt. */
const failureReason = (code: ErrorCode) =>
    DENY_REASONS.has(code) ? code : PlayerErrorCode.PLAYER_OFFLINE;

interface MemberRef {
    playerId: string;
    name: string;
    worldRoomId: string | undefined;
}

/**
 * Chủ party vào dungeon (hoặc "đi lại"). Quy trình đa room "cả party vào dungeon": party (trong global room) kiểm tra
 * nhóm, world room của từng thành viên kiểm lại rồi mới ra lệnh vào. Không phải giao dịch nguyên tử: world kiểm lại điều
 * kiện sống ngay trước khi chuyển, thất bại giữa chừng được báo cho cả party.
 */
export class DungeonLaunchGlobalService {
    /**
     * Chủ yêu cầu cả party vào dungeon (chưa có party thì tự tạo party 1 người). Thành công = đã ra lệnh
     * `mapChange` cho cả nhóm; thất bại = `code` (xem `ErrorCode`).
     */
    async launch(room: GlobalRoom, request: DungeonLaunchRequest): Promise<Result> {
        let party = room.runtime.parties.getPartyByPlayerId(request.leaderPlayerId);
        if (!party) {
            const leader = room.runtime.players.get(request.leaderPlayerId);
            if (!leader) return Response.error(PlayerErrorCode.PLAYER_OFFLINE);
            party = room.runtime.parties.create(leader);
            partyGlobalService.publishMembership(room, party, leader.playerId, party.id);
            partyNotifyGlobalService.broadcastState(room, party);
        }
        const refused = this.prepare(room, party, request);
        if (refused) return refused;

        // Chủ bấm hai lần: lượt sau không được chạy song song (sẽ bị world từ chối rồi báo nhầm cả party).
        if (party.launching) return Response.error(MapErrorCode.DUNGEON_LAUNCHING);
        party.launching = true;
        try {
            return await this.run(room, party, request);
        } finally {
            party.launching = false;
        }
    }

    private async run(
        room: GlobalRoom,
        party: PartyRuntime,
        request: DungeonLaunchRequest
    ): Promise<Result> {
        const members: MemberRef[] = party.joinOrder.map((playerId) => ({
            playerId,
            name: party.getMemberName(playerId),
            worldRoomId: worldRegistryGlobalService.worldRoomOf(room, playerId),
        }));

        const checks = await Promise.all(
            members.map(async (member) => ({
                member,
                result: member.worldRoomId
                    ? await room.runtime.checkDungeonEntry(member.worldRoomId, {
                          playerId: member.playerId,
                          dungeonCode: request.code,
                          retry: request.retry,
                      })
                    : Response.error(PlayerErrorCode.PLAYER_OFFLINE),
            }))
        );
        if (this.denied(room, party, request.code, checks))
            return Response.error(MapErrorCode.DUNGEON_DENIED);
        // Party có thể đã giải tán / đổi người trong lúc chờ world trả lời: danh sách `members` không còn đúng.
        if (party.disbanded) return Response.error(PartyErrorCode.PARTY_NOT_MEMBER);

        const instanceId = generateEntityId();
        await dungeonExpectationService.set(room.serverId, instanceId, {
            dungeonCode: request.code,
            leaderPlayerId: request.leaderPlayerId,
            expected: members.map((member) => member.playerId),
        });
        const results = await Promise.all(
            members.map(async (member) => ({
                member,
                result: await room.runtime.enterDungeon(member.worldRoomId!, {
                    playerId: member.playerId,
                    dungeonCode: request.code,
                    instanceId,
                    spawnId: request.spawnId,
                    retry: request.retry,
                }),
            }))
        );
        if (this.denied(room, party, request.code, results))
            return Response.error(MapErrorCode.DUNGEON_DENIED);
        return Response.success();
    }

    /** Kiểm tra nhóm trước khi hỏi từng world: chỉ chủ được bấm (và "đi lại" thì cả nhóm còn ở dungeon). Trả `Result` thất bại nếu từ chối. */
    private prepare(room: GlobalRoom, party: PartyRuntime, request: DungeonLaunchRequest) {
        if (!party.isLeader(request.leaderPlayerId))
            return Response.error(PartyErrorCode.PARTY_NOT_LEADER);
        if (request.retry) {
            if (!party.joinOrder.every((id) => request.presentPlayerIds?.includes(id))) {
                return Response.error(MapErrorCode.DUNGEON_NOT_TOGETHER);
            }
            return undefined;
        }
        // Điều kiện từng người (level, còn sống, đang ở dungeon khác...) do world của họ kiểm ở bước tiếp theo.
        return undefined;
    }

    /** Có ai không đạt thì báo cả party và trả `true`. */
    private denied(
        room: GlobalRoom,
        party: PartyRuntime,
        dungeonCode: string,
        results: { member: MemberRef; result: Result }[]
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
        // Báo cả party lý do không vào được dungeon.
        const deniedMessage: PartyDungeonDeniedMessage = { dungeonCode, failures };
        const deniedResult = Response.error(MapErrorCode.DUNGEON_DENIED, undefined, {
            ...deniedMessage,
        });
        for (const playerId of party.members.keys()) {
            room.clientOf(playerId)?.sendResult(GlobalMessage.PARTY_DUNGEON_DENIED, deniedResult);
        }
        return true;
    }
}

export const dungeonLaunchGlobalService = new DungeonLaunchGlobalService();
