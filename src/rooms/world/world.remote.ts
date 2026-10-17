import { roomCaller, type RoomRemote } from "@/core/rooms/room.integration.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/** Các method công khai của `WorldRoom` được phép gọi từ room khác. */
type WorldRpc =
    | "partyDeliverInvite"
    | "partyDeliverJoinRequest"
    | "partySetPlayerParty"
    | "partyCheckDungeon"
    | "partyEnterDungeon";

const call = roomCaller<WorldRoom>();

export const worldRoomRemote = (roomId: string): RoomRemote<WorldRoom, WorldRpc> => ({
    partyDeliverInvite: (...args) => call(roomId, "partyDeliverInvite", args, null),
    partyDeliverJoinRequest: (...args) => call(roomId, "partyDeliverJoinRequest", args, false),
    partySetPlayerParty: (...args) => call(roomId, "partySetPlayerParty", args),
    partyCheckDungeon: (...args) => call(roomId, "partyCheckDungeon", args, "offline"),
    partyEnterDungeon: (...args) => call(roomId, "partyEnterDungeon", args, "offline"),
});
