import { callRoom } from "@/core/rooms/room.integration.js";
import { PartySetPlayerPartyWorldCommand } from "@/rooms/world/modules/players/commands/party-set-player-party.world.command.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { partyDirectoryService } from "@/rooms/party/services/party-directory.service.js";
import type { PartyMembershipEvent } from "@/rooms/party/types/party-room.type.js";
import { randomUUID } from "node:crypto";

/** Báo world room biết player thuộc party nào (hoặc `null` = đã rời). */
export async function publishMembership(
    room: PartyRoom,
    worldRoomId: string,
    playerId: string,
    partyRoomId: string | null
): Promise<void> {
    const event: PartyMembershipEvent = {
        eventId: randomUUID(),
        sourcePartyId: room.roomId,
        revision: ++room.revision,
        playerId,
        partyRoomId,
        lootMode: room.state.lootMode,
    };
    await callRoom(worldRoomId, PartySetPlayerPartyWorldCommand, event);
}

/** Xoá con trỏ party và báo world room bỏ party của player. */
export async function releasePlayer(room: PartyRoom, playerId: string) {
    await partyDirectoryService.clearPartyRoomId(playerId);
    const worldRoomId = room.worldRoomOf.get(playerId);
    room.worldRoomOf.delete(playerId);
    if (worldRoomId) void publishMembership(room, worldRoomId, playerId, null);
}
