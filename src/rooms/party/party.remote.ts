import { roomCaller, type RoomRemote } from "@/core/rooms/room.integration.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";

/** Các method công khai của `PartyRoom` được phép gọi từ room khác. */
type PartyRpc =
    | "attachWorld"
    | "detachWorld"
    | "removeMember"
    | "report"
    | "requestJoin"
    | "declineInvite"
    | "prepareDungeon"
    | "notifyDungeonDenied"
    | "allocateKillReward";

const call = roomCaller<PartyRoom>();

export const partyRoomRemote = (roomId: string): RoomRemote<PartyRoom, PartyRpc> => ({
    attachWorld: (...args) => call(roomId, "attachWorld", args),
    detachWorld: (...args) => call(roomId, "detachWorld", args),
    removeMember: (...args) => call(roomId, "removeMember", args),
    report: (...args) => call(roomId, "report", args, false),
    requestJoin: (...args) => call(roomId, "requestJoin", args),
    declineInvite: (...args) => call(roomId, "declineInvite", args),
    prepareDungeon: (...args) => call(roomId, "prepareDungeon", args),
    notifyDungeonDenied: (...args) => call(roomId, "notifyDungeonDenied", args),
    allocateKillReward: (...args) => call(roomId, "allocateKillReward", args, null),
});
