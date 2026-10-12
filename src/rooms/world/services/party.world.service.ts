import { matchMaker, type Room } from "colyseus";
import type { PartyMemberInfo } from "@/modules/party/schemas/party.schema.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/user/services/master-data-cache.service.js";
import type { PartyLootMode } from "@/modules/party/schemas/party.schema.js";
import { shareKillReward } from "@/modules/party/utils/party-loot.util.js";
import { QuestObjectiveType } from "@/modules/quests/enums/quest.enum.js";
import type { Reward } from "@/modules/rewards/types/reward.type.js";
import type { GameMap } from "@/modules/maps/entities/game-map.entity.js";
import { mapService } from "@/modules/maps/user/services/map.service.js";
import { dungeonWorldService } from "@/rooms/world/services/dungeon.world.service.js";
import { partyDirectoryService } from "@/modules/party/services/party-directory.service.js";
import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import type { PartyRoomOptions } from "@/rooms/party/party.room.js";
import { questWorldService } from "@/rooms/world/services/quest.world.service.js";
import { rewardWorldService } from "@/rooms/world/services/reward.world.service.js";
import type { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import {
    MapTransferError,
    WorldMessage,
    type DungeonRetryResultMessage,
    type PartyInviteReceivedMessage,
    type PartyRoomMessage,
} from "@/rooms/world/world.message.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/** Heartbeat con trỏ party + online registry (khớp checkpoint 30s của room). */
export const PARTY_HEARTBEAT_MS = 30_000;
/** Gửi HP / level / map thành viên sang party room tối đa chừng này mỗi lần. */
export const PARTY_REPORT_MS = 1_000;

const callParty = async <T>(partyRoomId: string, method: string, args: unknown[], fallback: T) => {
    try {
        return (await matchMaker.remoteRoomCall(partyRoomId, method as keyof Room, args)) as T;
    } catch {
        return fallback;
    }
};

/**
 * Cầu nối world room ↔ party room: online registry (để party room tìm world room của người chơi), con
 * trỏ party sống xuyên suốt khi đổi map, báo HP/level/map, tạo party. Chia exp / quest nằm ở
 * `skill-owner.world.util.ts` (dùng `PlayerWorldState.partyRoomId`).
 */
export class PartyWorldService {
    private readonly lastReport = new WeakMap<PlayerWorldState, string>();
    /** Con trỏ chia item luân phiên theo party (trong process này). */
    private readonly lootCursor = new Map<string, number>();
    private readonly creating = new Map<string, Promise<string | undefined>>();

    toMemberInfo(room: WorldRoom, player: PlayerWorldState): PartyMemberInfo {
        return {
            playerId: player.id,
            name: player.name,
            level: player.level,
            hp: player.hp,
            maxHp: player.maxHp,
            mapCode: room.map.code,
            inWorld: true,
            inDungeon: room.dungeon !== undefined,
        };
    }

    /**
     * Player vừa vào world room (kể cả khi đổi map): ghi online registry; nếu đang trong party thì gắn
     * room này với party (room cũ sẽ detach sau, party room bỏ qua nếu room đã đổi).
     */
    async onJoin(room: WorldRoom, player: PlayerWorldState): Promise<void> {
        await partyDirectoryService.setWorldRoomId(player.id, room.roomId);
        const partyRoomId = await partyDirectoryService.getPartyRoomId(player.id);
        if (!partyRoomId) return;
        const lootMode = await callParty<PartyLootMode | null>(
            partyRoomId,
            "attachWorld",
            [player.id, room.roomId, this.toMemberInfo(room, player)],
            null
        );
        // Party room không còn, hoặc đã bỏ người này: dọn con trỏ chết.
        if (!lootMode) {
            await partyDirectoryService.clearPartyRoomId(player.id);
            return;
        }
        player.partyRoomId = partyRoomId;
        player.partyLootMode = lootMode;
    }

    /**
     * Player rời world room. Đổi map (`pendingMapCode`) → chỉ detach, party giữ nguyên; offline thật →
     * ra khỏi party ngay.
     */
    async onLeave(room: WorldRoom, player: PlayerWorldState): Promise<void> {
        await partyDirectoryService.clearWorldRoomId(player.id, room.roomId);
        const partyRoomId = player.partyRoomId;
        if (!partyRoomId) return;
        if (player.pendingMapCode) {
            await callParty(partyRoomId, "detachWorld", [player.id, room.roomId], undefined);
        } else {
            await callParty(partyRoomId, "removeMember", [player.id], undefined);
        }
    }

    /** Làm mới online registry + con trỏ party của mọi người trong room (mỗi `PARTY_HEARTBEAT_MS`). */
    async heartbeat(room: WorldRoom): Promise<void> {
        await Promise.all(
            [...room.state.players.values()].map(async (player) => {
                await partyDirectoryService.setWorldRoomId(player.id, room.roomId);
                if (player.partyRoomId) {
                    await partyDirectoryService.setPartyRoomId(player.id, player.partyRoomId);
                }
            })
        );
    }

    /** Gửi HP / level / map của thành viên party trong room sang party room, gộp theo party, chỉ khi đổi. */
    report(room: WorldRoom): void {
        const byParty = new Map<string, Partial<PartyMemberInfo>[]>();
        for (const player of room.state.players.values()) {
            if (!player.partyRoomId) continue;
            const info = this.toMemberInfo(room, player);
            const key = JSON.stringify([
                info.level,
                info.hp,
                info.maxHp,
                info.mapCode,
                info.inDungeon,
            ]);
            if (this.lastReport.get(player) === key) continue;
            this.lastReport.set(player, key);
            const list = byParty.get(player.partyRoomId) ?? [];
            list.push({
                playerId: info.playerId,
                level: info.level,
                hp: info.hp,
                maxHp: info.maxHp,
                mapCode: info.mapCode,
                inDungeon: info.inDungeon,
            });
            byParty.set(player.partyRoomId, list);
        }
        for (const [partyRoomId, updates] of byParty) {
            void callParty(partyRoomId, "report", [updates], undefined);
        }
    }

    /**
     * Party hiện tại của player, hoặc tạo party mới (player làm chủ). Dùng cho `partyCreate` và khi vào
     * dungeon mà chưa có party. Trả `roomId`; client nhận message `party` để `joinById`.
     */
    async ensureParty(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState
    ): Promise<string | undefined> {
        const inFlight = this.creating.get(player.id);
        if (inFlight) return inFlight;
        const task = this.createOrGet(room, client, player).finally(() =>
            this.creating.delete(player.id)
        );
        this.creating.set(player.id, task);
        return task;
    }

    private async createOrGet(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState
    ): Promise<string | undefined> {
        let partyRoomId = player.partyRoomId;
        if (partyRoomId && !(await this.isAlive(partyRoomId))) {
            player.partyRoomId = partyRoomId = null;
            await partyDirectoryService.clearPartyRoomId(player.id);
        }
        if (!partyRoomId) {
            const options: PartyRoomOptions = {
                leader: this.toMemberInfo(room, player),
                leaderWorldRoomId: room.roomId,
            };
            try {
                partyRoomId = (await matchMaker.createRoom("party", options)).roomId;
            } catch (err) {
                console.error("[Party] createRoom failed:", err);
                return undefined;
            }
            player.partyRoomId = partyRoomId;
            player.partyLootMode = masterDataCacheService.get(MasterDataKey.PARTY_CONFIG).lootMode;
            await partyDirectoryService.setPartyRoomId(player.id, partyRoomId);
        }
        const message: PartyRoomMessage = { roomId: partyRoomId };
        client.send(WorldMessage.PARTY, message);
        return partyRoomId;
    }

    /**
     * Vào dungeon luôn đi qua party: chưa có thì tự tạo party 1 người. Chủ yêu cầu party room kiểm cả
     * nhóm; đạt hết thì party room ra lệnh cho world room của từng thành viên (kể cả chủ). Thành viên
     * không phải chủ → `party_not_leader`; có người không đạt → `party_denied` (cả party đã được báo).
     */
    async startDungeon(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        dungeon: GameMap,
        spawnId: string
    ): Promise<string | undefined> {
        const partyRoomId = await this.ensureParty(room, client, player);
        if (!partyRoomId) return MapTransferError.MAP_NOT_OPEN;
        const result = await callParty<{ ok: boolean; error?: string } | null>(
            partyRoomId,
            "requestDungeon",
            [
                player.id,
                {
                    code: dungeon.code,
                    minLevel: dungeon.minLevel,
                    spawnId,
                },
            ],
            null
        );
        if (!result) return MapTransferError.MAP_NOT_OPEN;
        if (result.ok) return undefined;
        return result.error === "not_leader"
            ? MapTransferError.PARTY_NOT_LEADER
            : MapTransferError.PARTY_DENIED;
    }

    /**
     * Party room ra lệnh: đưa `playerId` (đang ở room này) vào instance dungeon của party. Kiểm lại điều
     * kiện ở đây (nguồn sự thật); trả mã lỗi hoặc `undefined` khi đã gửi `mapChange`.
     */
    async enterDungeon(
        room: WorldRoom,
        playerId: string,
        dungeonCode: string,
        instanceId: string,
        spawnId: string,
        retry = false
    ): Promise<string | undefined> {
        const found = this.findPlayer(room, playerId);
        if (!found) return "offline";
        const { client, player } = found;
        // Đang trong dungeon thì chỉ được sang instance mới của chính dungeon này sau khi đã clear ("đi lại").
        const canRetry = retry && room.dungeon?.cleared && room.map.code === dungeonCode;
        if (room.dungeon && !canRetry) return "in_dungeon";
        if (player.hp <= 0) return "dead";
        if (player.pendingMapCode) return "offline";
        let dungeon: GameMap;
        try {
            dungeon = await mapService.getActiveByCodeOrFail(dungeonCode);
        } catch {
            return MapTransferError.MAP_NOT_OPEN;
        }
        if (player.level < dungeon.minLevel) return MapTransferError.LEVEL_TOO_LOW;
        return dungeonWorldService.enter(room, client, player, dungeon, spawnId, instanceId);
    }

    /**
     * "Đi lại" sau khi clear dungeon: chỉ chủ party bấm được (solo = tự là chủ), và mọi thành viên phải
     * còn ở dungeon này — có ai đã thoát thì không đi. Lỗi báo bằng `dungeonRetryResult`; thành công thì
     * party room ra lệnh `mapChange` cho cả nhóm vào chung một instance mới.
     */
    async retryDungeon(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState
    ): Promise<void> {
        const reply = (result: DungeonRetryResultMessage) =>
            client.send(WorldMessage.DUNGEON_RETRY_RESULT, result);
        if (!room.dungeon?.cleared || player.pendingMapCode) return;
        const partyRoomId = await this.ensureParty(room, client, player);
        if (!partyRoomId) return reply({ ok: false, error: "unavailable" });
        // Người đã bấm thoát đang chờ chuyển map nên không còn tính là ở đây.
        const present = [...room.state.players.values()]
            .filter((other) => !other.pendingMapCode)
            .map((other) => other.id);
        const result = await callParty<{ ok: boolean; error?: string } | null>(
            partyRoomId,
            "requestDungeonRetry",
            [player.id, { code: room.map.code, spawnId: "default" }, present],
            null
        );
        if (!result) return reply({ ok: false, error: "unavailable" });
        if (!result.ok) reply({ ok: false, error: result.error ?? "unavailable" });
    }

    /** Party room gọi (qua world room): đã gắn / bỏ party cho player đang đứng ở room này. */
    setPlayerParty(
        room: WorldRoom,
        playerId: string,
        partyRoomId: string | null,
        lootMode?: PartyLootMode
    ): void {
        const player = this.findPlayer(room, playerId)?.player;
        if (!player) return;
        player.partyRoomId = partyRoomId;
        if (lootMode) player.partyLootMode = lootMode;
        this.lastReport.delete(player);
    }

    /** Party room gọi: chuyển lời mời tới client và trả snapshot người được mời. */
    deliverInvite(
        room: WorldRoom,
        playerId: string,
        payload: PartyInviteReceivedMessage
    ): PartyMemberInfo | null {
        const found = this.findPlayer(room, playerId);
        if (!found) return null;
        found.client.send(WorldMessage.PARTY_INVITE_RECEIVED, payload);
        return this.toMemberInfo(room, found.player);
    }

    async declineInvite(playerId: string, partyRoomId: string): Promise<void> {
        await callParty(partyRoomId, "declineInvite", [playerId], undefined);
    }

    /**
     * Thành viên cùng party đang ở **room này** và còn sống (gồm `attacker`). Không party → chỉ `attacker`.
     * Phạm vi chia thưởng = cùng map (cùng room), không xét khoảng cách.
     */
    killParticipants(
        room: WorldRoom,
        attackerSessionId: string,
        attacker: PlayerWorldState
    ): { sessionId: string; player: PlayerWorldState }[] {
        const solo = [{ sessionId: attackerSessionId, player: attacker }];
        if (!attacker.partyRoomId) return solo;
        const members: { sessionId: string; player: PlayerWorldState }[] = [];
        for (const [sessionId, player] of room.state.players) {
            if (player.partyRoomId === attacker.partyRoomId && player.hp > 0) {
                members.push({ sessionId, player });
            }
        }
        return members.some((member) => member.player === attacker) ? members : solo;
    }

    /**
     * Phần thưởng khi hạ quái cho party cùng room (`shareKillReward`): exp chia đều có bonus, vàng chia
     * đều, item chia theo cách chủ party chọn; thành viên chênh level với quái quá `maxLevelGap` không
     * được chia (người kết liễu luôn được tính). Mọi thành viên còn sống trong room đều nhận tiến độ
     * quest kill như người kết liễu.
     */
    grantKill(
        room: WorldRoom,
        attackerSessionId: string,
        attacker: PlayerWorldState,
        reward: Reward,
        target: { code: string; level: number }
    ): void {
        const participants = this.killParticipants(room, attackerSessionId, attacker);
        if (participants.length <= 1) {
            rewardWorldService.grant(room, attackerSessionId, attacker, reward);
            return;
        }
        const config = masterDataCacheService.get(MasterDataKey.PARTY_CONFIG);
        const partyRoomId = attacker.partyRoomId!;
        const { rewards, nextCursor } = shareKillReward(
            reward,
            attacker.id,
            participants.map(({ player }) => ({ id: player.id, level: player.level })),
            target.level,
            {
                expBonusPerExtraMember: config.expBonusPerExtraMember,
                maxLevelGap: config.maxLevelGap,
                shareGold: config.shareGold,
                lootMode: attacker.partyLootMode,
                cursor: this.lootCursor.get(partyRoomId) ?? 0,
            }
        );
        this.lootCursor.set(partyRoomId, nextCursor);
        for (const { sessionId, player } of participants) {
            const share = rewards.get(player.id);
            if (share) rewardWorldService.grant(room, sessionId, player, share);
            if (player === attacker) continue;
            questWorldService.onEvent(room, sessionId, player, {
                type: QuestObjectiveType.KILL,
                targetCode: target.code,
            });
        }
    }

    findPlayer(
        room: WorldRoom,
        playerId: string
    ): { client: PlayerClient; player: PlayerWorldState } | undefined {
        for (const [sessionId, player] of room.state.players) {
            if (player.id !== playerId) continue;
            const client = room.clients.getById(sessionId) as PlayerClient | undefined;
            return client ? { client, player } : undefined;
        }
        return undefined;
    }

    private async isAlive(roomId: string) {
        try {
            return (await matchMaker.getRoomById(roomId)) !== undefined;
        } catch {
            return false;
        }
    }
}

export const partyWorldService = new PartyWorldService();
