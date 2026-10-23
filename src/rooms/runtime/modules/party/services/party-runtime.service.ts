import type { ErrorCode } from "@/core/types/result.type.js";
import { generateEntityId } from "@/core/entities/base.entity.js";
import { PartyRuntime } from "@/rooms/runtime/modules/party/runtime/party-runtime.js";

/** Kết quả `PartyRuntimeService.remove`: để nơi gọi biết cần báo gì cho ai. */
export interface PartyRemoval {
    /** Tên người vừa rời. */
    name: string;
    /** Chủ mới nếu người rời là chủ và party còn người. */
    newLeaderId?: string;
    /** Party đã hết người (hoặc đã giải tán trước đó) nên không còn ai để báo. */
    gone: boolean;
}

/**
 * Mọi party của game server và con trỏ `playerId → party` trong bộ nhớ process. Chỉ đổi dữ liệu, KHÔNG gửi message hay báo world: việc
 * đó do nơi gọi làm (xem `partyGlobalService`). Một player là thành viên từ lúc tạo / nhận lời mời đến khi rời, bị đá, giải tán hoặc kết
 * nối global của họ kết thúc.
 */
export class PartyRuntimeService {
    private readonly parties = new Map<string, PartyRuntime>();
    private readonly partyIdByPlayerId = new Map<string, string>();

    getParty(partyId: string | undefined): PartyRuntime | undefined {
        return partyId === undefined ? undefined : this.parties.get(partyId);
    }

    getPartyByPlayerId(playerId: string): PartyRuntime | undefined {
        return this.getParty(this.partyIdByPlayerId.get(playerId));
    }

    get(): IterableIterator<PartyRuntime> {
        return this.parties.values();
    }

    /** Tạo party mới do `leader` làm chủ (`leader` chưa ở party nào). */
    create(leader: { playerId: string; name: string }): PartyRuntime {
        const party = new PartyRuntime(generateEntityId(), leader);
        this.parties.set(party.id, party);
        this.partyIdByPlayerId.set(leader.playerId, party.id);
        return party;
    }

    /** Vào party bằng lời mời còn hạn. Trả mã lỗi nếu không vào được. */
    join(party: PartyRuntime, playerId: string): ErrorCode | undefined {
        const error = party.joinWithInvite(playerId);
        if (error) return error;
        this.partyIdByPlayerId.set(playerId, party.id);
        return undefined;
    }

    /**
     * Bỏ `playerId` khỏi party (tự rời / bị đá / mất kết nối), đổi chủ nếu cần; hết người thì party biến mất.
     * Trả `undefined` nếu họ không ở party này.
     */
    remove(party: PartyRuntime, playerId: string): PartyRemoval | undefined {
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
    disband(party: PartyRuntime): string[] {
        party.disbanded = true;
        const memberIds = party.joinOrder;
        for (const playerId of memberIds) this.partyIdByPlayerId.delete(playerId);
        this.parties.delete(party.id);
        return memberIds;
    }
}
