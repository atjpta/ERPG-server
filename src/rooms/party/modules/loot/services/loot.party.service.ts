import { shareKillReward } from "@/rooms/party/services/party-loot.js";
import type { PartyState } from "@/rooms/party/schemas/party.state.js";
import type { KillRewardRequest, KillRewardShare } from "@/rooms/party/types/party-room.type.js";

/** One allocator per party room; retries return the original allocation without advancing the cursor. */
export class PartyLootRoomService {
    private cursor = 0;
    private readonly allocations = new Map<string, KillRewardShare[]>();
    allocate(state: PartyState, request: KillRewardRequest): KillRewardShare[] | null {
        const previous = this.allocations.get(request.eventId);
        if (previous) return structuredClone(previous);
        if (!state.has(request.killerId)) return null;
        const supplied = new Map(request.participants.map((p) => [p.id, p]));
        const participants = state.joinOrder.flatMap((id) =>
            supplied.has(id) ? [supplied.get(id)!] : []
        );
        if (!participants.some((p) => p.id === request.killerId)) return null;
        const { rewards, nextCursor } = shareKillReward(
            request.reward,
            request.killerId,
            participants,
            request.monsterLevel,
            {
                expBonusPerExtraMember: state.config.expBonusPerExtraMember,
                maxLevelGap: state.config.maxLevelGap,
                shareGold: state.config.shareGold,
                lootMode: state.lootMode,
                cursor: this.cursor,
            }
        );
        this.cursor = nextCursor;
        const result = [...rewards].map(([playerId, reward]) => ({ playerId, reward }));
        this.allocations.set(request.eventId, structuredClone(result));
        if (this.allocations.size > 1024)
            this.allocations.delete(this.allocations.keys().next().value!);
        return result;
    }
}
