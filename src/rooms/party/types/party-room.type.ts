import type { Reward } from "@/modules/rewards/types/reward.type.js";
import type { PartyLootMode, PartyMemberInfo } from "@/rooms/party/schemas/party.schema.js";
import type { PartyDungeonDeniedMessage } from "@/rooms/party/types/party-message.type.js";

export interface PartyRoomOptions {
    leader: PartyMemberInfo;
    leaderWorldRoomId: string;
}
export interface InvitePayload {
    partyRoomId: string;
    fromName: string;
    expiresInSec: number;
    autoAccept?: boolean;
}
export interface JoinRequestPayload {
    partyRoomId: string;
    fromName: string;
    expiresInSec: number;
}
export interface PartyMembershipEvent {
    eventId: string;
    sourcePartyId: string;
    revision: number;
    playerId: string;
    partyRoomId: string | null;
    lootMode: PartyLootMode;
}
export interface PartySnapshot {
    partyRoomId: string;
    revision: number;
    lootMode: PartyLootMode;
}
export interface DungeonPartyRequest {
    leaderPlayerId: string;
    code: string;
    spawnId: string;
    minLevel?: number;
    retry: boolean;
    presentPlayerIds?: string[];
}
export interface DungeonPartyMember {
    playerId: string;
    name: string;
    worldRoomId: string | null;
}
export type DungeonPartyPlan =
    { ok: false; error: string } | { ok: true; members: DungeonPartyMember[] };
export type DungeonFailure = PartyDungeonDeniedMessage["failures"][number];
export interface KillRewardRequest {
    eventId: string;
    killerId: string;
    monsterLevel: number;
    reward: Reward;
    participants: { id: string; level: number }[];
}
export interface KillRewardShare {
    playerId: string;
    reward: Reward;
}
