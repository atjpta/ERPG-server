import { Response } from "@/core/response/response.js";
import { generateEntityId } from "@/core/entities/base.entity.js";
import { PartyState } from "@/modules/party/state/party.state.js";
import type { PartyRemoval } from "@/modules/party/types/party-state.type.js";

/**
 * Mọi party của game server và con trỏ `playerId → party` trong bộ nhớ process. Chỉ đổi dữ liệu, KHÔNG gửi message hay báo world: việc
 * đó do nơi gọi làm (xem `partyGlobalService`). Một player là thành viên từ lúc tạo / nhận lời mời đến khi rời, bị đá, giải tán hoặc kết
 * nối global của họ kết thúc.
 */
export class PartyStateManager {
    private readonly parties = new Map<string, PartyState>();
    private readonly partyIdByPlayerId = new Map<string, string>();

    getParty(partyId: string | undefined): PartyState | undefined {
        return partyId === undefined ? undefined : this.parties.get(partyId);
    }

    getPartyByPlayerId(playerId: string): PartyState | undefined {
        return this.getParty(this.partyIdByPlayerId.get(playerId));
    }

    get(): IterableIterator<PartyState> {
        return this.parties.values();
    }

    /** Tạo party mới do `leader` làm chủ (`leader` chưa ở party nào). */
    create(leader: { playerId: string; name: string }): PartyState {
        const party = new PartyState(generateEntityId(), leader);
        this.parties.set(party.id, party);
        this.partyIdByPlayerId.set(leader.playerId, party.id);
        return party;
    }

    /** Vào party bằng lời mời còn hạn. Trả mã lỗi nếu không vào được. */
    join(party: PartyState, playerId: string): Response {
        const joined = party.joinWithInvite(playerId);
        if (Response.isError(joined)) return joined;
        this.partyIdByPlayerId.set(playerId, party.id);
        return joined;
    }

    /**
     * Bỏ `playerId` khỏi party (tự rời / bị đá / mất kết nối), đổi chủ nếu cần; hết người thì party biến mất.
     * Trả `undefined` nếu họ không ở party này.
     */
    remove(party: PartyState, playerId: string): PartyRemoval | undefined {
        if (!party.hasMember(playerId)) return undefined;
        const name = party.getMemberName(playerId);
        const newLeaderId = party.leave(playerId);
        this.partyIdByPlayerId.delete(playerId);
        if (party.disbanded) return { name, gone: true };
        if (party.size === 0) {
            party.disbanded = true;
            this.parties.delete(party.id);
            return { name, gone: true };
        }
        return { name, newLeaderId, gone: false };
    }

    /** Giải tán: đưa mọi thành viên ra, trả danh sách `playerId` vừa bị đưa ra (theo thứ tự vào party). */
    disband(party: PartyState): string[] {
        party.disbanded = true;
        const memberIds = party.joinOrder;
        for (const playerId of memberIds) this.partyIdByPlayerId.delete(playerId);
        this.parties.delete(party.id);
        return memberIds;
    }
}
