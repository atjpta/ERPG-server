import { matchMaker, type Room } from "colyseus";
import type { PartyMemberInfo } from "@/modules/party/schemas/party.schema.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/user/services/master-data-cache.service.js";
import { splitPartyExp } from "@/modules/party/utils/party-exp.util.js";
import { QuestObjectiveType } from "@/modules/quests/enums/quest.enum.js";
import type { Reward } from "@/modules/rewards/types/reward.type.js";
import { partyDirectoryService } from "@/modules/party/services/party-directory.service.js";
import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import type { PartyRoomOptions } from "@/rooms/party/party.room.js";
import { questWorldService } from "@/rooms/world/services/quest.world.service.js";
import { rewardWorldService } from "@/rooms/world/services/reward.world.service.js";
import type { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import {
    WorldMessage,
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
        const attached = await callParty<boolean>(
            partyRoomId,
            "attachWorld",
            [player.id, room.roomId, this.toMemberInfo(room, player)],
            false
        );
        // Party room không còn, hoặc đã bỏ người này: dọn con trỏ chết.
        if (!attached) {
            await partyDirectoryService.clearPartyRoomId(player.id);
            return;
        }
        player.partyRoomId = partyRoomId;
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
            await partyDirectoryService.setPartyRoomId(player.id, partyRoomId);
        }
        const message: PartyRoomMessage = { roomId: partyRoomId };
        client.send(WorldMessage.PARTY, message);
        return partyRoomId;
    }

    /** Party room gọi (qua world room): đã gắn / bỏ party cho player đang đứng ở room này. */
    setPlayerParty(room: WorldRoom, playerId: string, partyRoomId: string | null): void {
        const player = this.findPlayer(room, playerId)?.player;
        if (!player) return;
        player.partyRoomId = partyRoomId;
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
     * Phần thưởng khi hạ quái: người kết liễu nhận nguyên vàng + item; **exp** chia đều cho thành viên
     * party cùng room (có bonus theo số người, `party_config`). Mỗi thành viên đủ điều kiện nhận tiến độ
     * quest kill như người kết liễu.
     */
    grantKill(
        room: WorldRoom,
        attackerSessionId: string,
        attacker: PlayerWorldState,
        reward: Reward,
        targetCode: string
    ): void {
        const participants = this.killParticipants(room, attackerSessionId, attacker);
        if (participants.length <= 1) {
            rewardWorldService.grant(room, attackerSessionId, attacker, reward);
            return;
        }
        const config = masterDataCacheService.get(MasterDataKey.PARTY_CONFIG);
        const exp = splitPartyExp(reward.exp, participants.length, config.expBonusPerExtraMember);
        for (const { sessionId, player } of participants) {
            if (player === attacker) {
                rewardWorldService.grant(room, sessionId, player, { ...reward, exp });
                continue;
            }
            rewardWorldService.grant(room, sessionId, player, {
                currency: [],
                items: [],
                source: reward.source,
                exp,
            });
            questWorldService.onEvent(room, sessionId, player, {
                type: QuestObjectiveType.KILL,
                targetCode,
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
