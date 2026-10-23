/** Quá ngưỡng này thì dọn con trỏ của party đã không còn ai trong room. */
const MAX_TRACKED_PARTIES = 64;

/** Con trỏ chia item luân phiên (round robin) theo từng party trong một room. */
export class PartyLootState {
    private readonly cursors = new Map<string, number>();

    cursorOf(partyId: string): number {
        return this.cursors.get(partyId) ?? 0;
    }

    advance(partyId: string, nextCursor: number): void {
        this.cursors.set(partyId, nextCursor);
    }

    /** Khi theo dõi quá nhiều party, bỏ con trỏ của party không còn ai (`presentPartyIds`) trong room. */
    prune(presentPartyIds: ReadonlySet<string | null>): void {
        if (this.cursors.size <= MAX_TRACKED_PARTIES) return;
        for (const partyId of this.cursors.keys()) {
            if (!presentPartyIds.has(partyId)) this.cursors.delete(partyId);
        }
    }
}
