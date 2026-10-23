import { worldRegistryGlobalService } from "@/rooms/global/modules/world-registry/services/world-registry.global.service.js";
import { generateEntityId } from "@/core/entities/base.entity.js";
import { callRoom } from "@/core/rooms/room.integration.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import type { PartyMembershipEvent } from "@/rooms/global/global.shared.js";
import { PartyNotice } from "@/rooms/global/modules/party/enums/party-notice.enum.js";
import type { PartyLeftMessage } from "@/rooms/global/modules/party/interfaces/party.global.message.js";
import type { PartyState } from "@/rooms/global/modules/party/schemas/party.global.state.js";
import { partyNotifyGlobalService } from "@/rooms/global/modules/party/services/party-notify.global.service.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { PartySetPlayerPartyWorldCommand } from "@/rooms/world/modules/players/commands/party-set-player-party.world.command.js";

/** Hẹn giờ hết hạn của một lời mời; huỷ được khi lời mời bị dùng / từ chối / party không còn. */
type InviteTimer = ReturnType<GlobalRoom["clock"]["setTimeout"]>;

/**
 * Thao tác trên party kèm mọi tác dụng phụ: `PartiesState` / `PartyState` chỉ đổi dữ liệu, còn gửi message cho client
 * và báo world room (`PartySetPlayerPartyWorldCommand`) do đây làm.
 */
export class PartyGlobalService {
    /** `partyId:targetId` → hẹn giờ hết hạn của lời mời (timer thuộc `room.clock`, tự dọn khi room dispose). */
    private readonly inviteTimers = new Map<string, InviteTimer>();

    /**
     * Báo world room đang giữ `playerId` biết họ thuộc party nào (hoặc `null` = đã rời) và cách chia loot hiện tại.
     * Không có world room (chưa attach / đang đổi map) thì bỏ qua: lúc attach world nhận snapshot mới.
     */
    async publishMembership(
        room: GlobalRoom,
        party: PartyState,
        playerId: string,
        partyId: string | null
    ): Promise<void> {
        const worldRoomId = worldRegistryGlobalService.worldRoomOf(room, playerId);
        if (!worldRoomId) return;
        const event: PartyMembershipEvent = {
            eventId: generateEntityId(),
            sourcePartyId: party.id,
            revision: ++party.revision,
            playerId,
            partyId,
            lootMode: party.lootMode,
        };
        await callRoom(worldRoomId, PartySetPlayerPartyWorldCommand, event);
    }

    /**
     * Cho `playerId` rời party (tự rời / bị đá / mất kết nối): báo world, báo người đó `PARTY_LEFT`, báo phần còn lại
     * (`code`, chủ mới nếu đổi chủ) và gửi state mới.
     */
    removeMember(room: GlobalRoom, party: PartyState, playerId: string, code: PartyNotice): void {
        const removal = room.state.parties.remove(party, playerId);
        if (!removal) return;
        void this.publishMembership(room, party, playerId, null);
        partyNotifyGlobalService.sendTo(room, playerId, GlobalMessage.PARTY_LEFT, {
            partyId: party.id,
        } satisfies PartyLeftMessage);
        if (removal.gone) {
            this.cancelInviteExpiries(party.id);
            return;
        }

        partyNotifyGlobalService.broadcastNotice(room, party, code, removal.name);
        if (removal.newLeaderId) {
            partyNotifyGlobalService.broadcastNotice(
                room,
                party,
                PartyNotice.LEADER_CHANGED,
                party.getMemberName(removal.newLeaderId)
            );
        }
        partyNotifyGlobalService.broadcastState(room, party);
    }

    /** Huỷ hẹn giờ hết hạn của lời mời `targetId` vào party (lời mời đã được dùng hoặc bỏ). */
    cancelInviteExpiry(partyId: string, targetId: string): void {
        const key = `${partyId}:${targetId}`;
        this.inviteTimers.get(key)?.clear();
        this.inviteTimers.delete(key);
    }

    /** Hẹn giờ `party_config.inviteTtlSec`: hết giờ thì xoá lời mời và báo chủ `invite_expired`. Gọi sau khi `addInvite` thành công. */
    scheduleInviteExpiry(room: GlobalRoom, party: PartyState, targetId: string): void {
        // Mời lại cùng người thì lời mời mới thay lời mời cũ, hẹn giờ cũ không còn đúng.
        this.cancelInviteExpiry(party.id, targetId);
        const key = `${party.id}:${targetId}`;
        this.inviteTimers.set(
            key,
            room.clock.setTimeout(() => {
                this.inviteTimers.delete(key);
                // Timer còn sống nghĩa là lời mời này chưa được dùng / từ chối / thay: nó hết hạn thật.
                const expired = party.removeInvite(targetId);
                if (!expired || party.disbanded) return;
                partyNotifyGlobalService.notifyLeader(
                    room,
                    party,
                    PartyNotice.INVITE_EXPIRED,
                    expired.targetName
                );
            }, party.config.inviteTtlSec * 1000)
        );
    }

    /** Huỷ mọi hẹn giờ hết hạn của một party (party giải tán / hết người). */
    cancelInviteExpiries(partyId: string): void {
        const prefix = `${partyId}:`;
        for (const [key, timer] of this.inviteTimers) {
            if (!key.startsWith(prefix)) continue;
            timer.clear();
            this.inviteTimers.delete(key);
        }
    }
}

export const partyGlobalService = new PartyGlobalService();
