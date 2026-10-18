import { callRoom } from "@/core/rooms/room.integration.js";
import { AttachWorldPartyCommand } from "@/rooms/party/commands/attach-world.party.command.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { sendOk } from "@/core/utils/room-send.util.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import type {
    PartyMemberInfo,
    PartyMembershipEvent,
    PartyRoomOptions,
    PartySnapshot,
} from "@/rooms/party/party.shared.js";
import { partyDirectoryService } from "@/rooms/party/party.shared.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { WorldMessage, type PartyRoomMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { matchMaker } from "colyseus";
export class PlayerPartyWorldService {
    private readonly creating = new Map<string, Promise<string | undefined>>();
    readonly lastReport = new WeakMap<PlayerWorldState, string>();
    private readonly revisions = new WeakMap<PlayerWorldState, Map<string, number>>();
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
    private tellParty(room: WorldRoom, playerId: string, partyRoomId: string | null): void {
        const message: PartyRoomMessage = { roomId: partyRoomId ?? "" };
        const found = this.findPlayer(room, playerId);
        if (found) sendOk(found.client, WorldMessage.PARTY, message);
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
    async ensureParty(room: WorldRoom, player: PlayerWorldState): Promise<string | undefined> {
        const partyRoomId = await this.ensurePartyRoom({
            leader: this.toMemberInfo(room, player),
            leaderWorldRoomId: room.roomId,
        });
        if (!partyRoomId) return undefined;
        const attached = await callRoom(partyRoomId, AttachWorldPartyCommand, {
            playerId: player.id,
            worldRoomId: room.roomId,
            info: this.toMemberInfo(room, player),
        });
        if (!attached.success) return undefined;
        this.applySnapshot(room, player, attached.data);
        return partyRoomId;
    }
    async setPlayerParty(room: WorldRoom, event: PartyMembershipEvent): Promise<void> {
        const player = this.findPlayer(room, event.playerId)?.player;
        if (!player) return;
        const revisions = this.revisions.get(player) ?? new Map<string, number>();
        this.revisions.set(player, revisions);
        if (event.revision <= (revisions.get(event.sourcePartyId) ?? -1)) return;
        if (
            event.partyRoomId &&
            (await partyDirectoryService.getPartyRoomId(player.id)) !== event.partyRoomId
        )
            return;
        if (!event.partyRoomId && player.partyRoomId !== event.sourcePartyId) return;
        if (event.revision <= (revisions.get(event.sourcePartyId) ?? -1)) return;
        revisions.set(event.sourcePartyId, event.revision);
        this.revisions.set(player, revisions);
        player.partyRoomId = event.partyRoomId;
        player.partyLootMode = event.lootMode;
        this.lastReport.delete(player);
        this.tellParty(room, player.id, event.partyRoomId);
    }
    applySnapshot(room: WorldRoom, player: PlayerWorldState, snapshot: PartySnapshot): void {
        player.partyRoomId = snapshot.partyRoomId;
        player.partyLootMode = snapshot.lootMode;
        this.revisions.set(player, new Map([[snapshot.partyRoomId, snapshot.revision]]));
        this.tellParty(room, player.id, snapshot.partyRoomId);
    }
    /** Matchmaking listing only; a positive result does not guarantee RPC availability. */
    async isPartyRoomListed(roomId: string) {
        try {
            return (await matchMaker.getRoomById(roomId)) !== undefined;
        } catch {
            return false;
        }
    }
    private ensurePartyRoom(options: PartyRoomOptions): Promise<string | undefined> {
        const key = options.leader.playerId;
        const existing = this.creating.get(key);
        if (existing) return existing;
        const task = this.createOrGet(options).finally(() => this.creating.delete(key));
        this.creating.set(key, task);
        return task;
    }
    private async createOrGet(options: PartyRoomOptions): Promise<string | undefined> {
        const playerId = options.leader.playerId;
        const existing = await partyDirectoryService.getPartyRoomId(playerId);
        if (existing && (await this.isPartyRoomListed(existing))) {
            const attached = await callRoom(existing, AttachWorldPartyCommand, {
                playerId,
                worldRoomId: options.leaderWorldRoomId,
                info: options.leader,
            });
            if (attached.success) return existing;
            // Không gọi được room (khác với "không còn là thành viên"): không tạo party mới.
            if (attached.code === CommonCode.ROOM_UNAVAILABLE) return undefined;
        }
        try {
            const id = (await matchMaker.createRoom("party", options)).roomId;
            await partyDirectoryService.setPartyRoomId(playerId, id);
            return id;
        } catch (error) {
            console.error("[Party] createRoom failed:", error);
            return undefined;
        }
    }
}
export const playerPartyWorldService = new PlayerPartyWorldService();
