import type { PartyDungeonDeniedMessage } from "@/rooms/global/modules/dungeon-launch/interfaces/dungeon.global.message.js";
import type { PartyLootMode } from "@/rooms/global/modules/party/types/party-member.type.js";

/** Báo world room biết player thuộc party nào (hoặc `null` = đã rời) hoặc đổi cách chia loot. */
export interface PartyMembershipEvent {
    eventId: string;
    sourcePartyId: string;
    revision: number;
    playerId: string;
    partyId: string | null;
    lootMode: PartyLootMode;
}

/** Party của player lúc world room attach. */
export interface PartySnapshot {
    partyId: string;
    revision: number;
    lootMode: PartyLootMode;
}

export type DungeonFailure = PartyDungeonDeniedMessage["failures"][number];
