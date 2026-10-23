import { checkDungeonEntry, enterDungeon } from "@/rooms/bus/room-bus.js";
import type { DungeonLaunchRequest } from "@/modules/maps/types/dungeon-launch.type.js";
import type { ErrorCode } from "@/core/response/result.type.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import type { PartyDungeonDeniedMessage } from "@/rooms/global/modules/dungeon-launch/interfaces/dungeon.global.message.js";
import type { PartyState } from "@/modules/party/state/party.state.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import { PartyErrorCode } from "@/modules/party/enums/party-error-code.enum.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { Response } from "@/core/response/response.js";
import { RoomResponse } from "@/core/response/room-response.js";
import { dungeonExpectationService } from "@/modules/maps/services/dungeon-expectation.service.js";
import { generateEntityId } from "@/core/entities/base.entity.js";
import { partyGlobalService } from "@/rooms/global/modules/party/services/party.global.service.js";
import { partyNotifyGlobalService } from "@/rooms/global/modules/party/services/party-notify.global.service.js";

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
    async launch(room: GlobalRoom, request: DungeonLaunchRequest): Promise<Response> {
        let party = room.parties.getPartyByPlayerId(request.leaderPlayerId);
        if (!party) {
            const leader = room.players.get(request.leaderPlayerId);
            if (!leader) return Response.error(PlayerErrorCode.PLAYER_OFFLINE);
            party = room.parties.create(leader);
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
        party: PartyState,
        request: DungeonLaunchRequest
    ): Promise<Response> {
        const members: MemberRef[] = party.joinOrder.map((playerId) => ({
            playerId,
            name: party.getMemberName(playerId),
            worldRoomId: room.players.get(playerId)?.worldRoomId,
        }));

        const checks = await Promise.all(
            members.map(async (member) => ({
                member,
                result: member.worldRoomId
                    ? await checkDungeonEntry(member.worldRoomId, {
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
                result: await enterDungeon(member.worldRoomId!, {
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

    /** Kiểm tra nhóm trước khi hỏi từng world: chỉ chủ được bấm (và "đi lại" thì cả nhóm còn ở dungeon). Trả `Response` thất bại nếu từ chối. */
    private prepare(room: GlobalRoom, party: PartyState, request: DungeonLaunchRequest) {
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
        party: PartyState,
        dungeonCode: string,
        results: { member: MemberRef; result: Response }[]
    ) {
        const failures = results.flatMap(({ member, result }) =>
            Response.isError(result)
                ? [
                      {
                          playerId: member.playerId,
                          name: member.name,
                          reason: failureReason(result.errorCode),
                      },
                  ]
                : []
        );
        if (!failures.length) return false;
        // Báo cả party lý do không vào được dungeon.
        const deniedMessage: PartyDungeonDeniedMessage = { dungeonCode, failures };
        for (const playerId of party.members.keys()) {
            const client = room.clientOf(playerId);
            if (!client) continue;
            RoomResponse.sendError(
                client,
                GlobalMessage.PARTY_DUNGEON_DENIED,
                MapErrorCode.DUNGEON_DENIED,
                { ...deniedMessage }
            );
        }
        return true;
    }
}

export const dungeonLaunchGlobalService = new DungeonLaunchGlobalService();
