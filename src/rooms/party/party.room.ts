import { KickReason } from "@/core/enums/kick-reason.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { dispatchForResult } from "@/core/utils/dispatch-result.util.js";
import { loadRoomMessages } from "@/core/utils/load-room-messages.util.js";
import { AuthenticatedPlayerRoom } from "@/rooms/index.room.js";
import { AttachWorldPartyCommand } from "@/rooms/party/commands/attach-world.party.command.js";
import { DeclineInvitePartyCommand } from "@/rooms/party/commands/decline-invite.party.command.js";
import { DetachWorldPartyCommand } from "@/rooms/party/commands/detach-world.party.command.js";
import { NotifyDungeonDeniedPartyCommand } from "@/rooms/party/commands/notify-dungeon-denied.party.command.js";
import { OnCreatePartyCommand } from "@/rooms/party/commands/on-create.party.command.js";
import { OnJoinPartyCommand } from "@/rooms/party/commands/on-join.party.command.js";
import { OnLeavePartyCommand } from "@/rooms/party/commands/on-leave.party.command.js";
import { PrepareDungeonPartyCommand } from "@/rooms/party/commands/prepare-dungeon.party.command.js";
import { ReportPartyCommand } from "@/rooms/party/commands/report.party.command.js";
import { RequestJoinPartyCommand } from "@/rooms/party/commands/request-join.party.command.js";
import { AllocateKillRewardPartyCommand } from "@/rooms/party/modules/loot/commands/allocate-kill-reward.party.command.js";
import { PartyLootRoomService } from "@/rooms/party/modules/loot/services/loot.party.service.js";
import { RemoveMemberPartyCommand } from "@/rooms/party/modules/members/commands/remove-member.party.command.js";
import type { PartyMemberInfo } from "@/rooms/party/schemas/party.schema.js";
import { PartyState } from "@/rooms/party/schemas/party.state.js";
import type {
    DungeonFailure,
    DungeonPartyRequest,
    KillRewardRequest,
    PartyRoomOptions,
} from "@/rooms/party/types/party-room.type.js";
import { Dispatcher } from "@colyseus/command";
const messages = await loadRoomMessages(new URL(".", import.meta.url));

export class PartyRoom extends AuthenticatedPlayerRoom<{
    state: PartyState;
    client: PlayerClient;
}> {
    state = new PartyState();
    messages = messages;
    dispatcher = new Dispatcher(this);
    readonly loot = new PartyLootRoomService();

    /** Bộ đếm chung cho `attachWorld` và thông báo membership: world so sánh để bỏ qua bản cũ. */
    revision = 0;
    readonly worldReportRevisions = new Map<string, number>();
    serverId = "";
    /** playerId → sessionId của kết nối party. */
    readonly sessionOf = new Map<string, string>();
    /** playerId → world room đang đứng (để gọi lệnh). */
    readonly worldRoomOf = new Map<string, string>();
    disbanded = false;

    protected override shouldKickFor(reason: KickReason) {
        return reason !== KickReason.DUPLICATE_LOGIN;
    }
    registerPlayer(client: PlayerClient) {
        return this.registerOnlinePlayer(client, { kickDuplicateLogins: false });
    }
    unregisterPlayer(client: PlayerClient) {
        return this.unregisterOnlinePlayer(client);
    }

    async onCreate(options: PartyRoomOptions) {
        await this.dispatcher.dispatch(new OnCreatePartyCommand(), options);
    }
    async onJoin(client: PlayerClient) {
        await this.dispatcher.dispatch(new OnJoinPartyCommand(), { client });
    }
    async onLeave(client: PlayerClient) {
        await this.dispatcher.dispatch(new OnLeavePartyCommand(), { client });
    }
    onDispose() {
        this.dispatcher.stop();
    }

    // ---- RPC: gọi từ room khác qua matchMaker.remoteRoomCall; mỗi RPC chạy trong một command ----

    attachWorld(playerId: string, worldRoomId: string, info?: Partial<PartyMemberInfo>) {
        return dispatchForResult(this.dispatcher, new AttachWorldPartyCommand(), {
            playerId,
            worldRoomId,
            info,
        });
    }
    async detachWorld(playerId: string, worldRoomId: string) {
        await this.dispatcher.dispatch(new DetachWorldPartyCommand(), { playerId, worldRoomId });
    }
    async removeMember(playerId: string, worldRoomId: string) {
        await this.dispatcher.dispatch(new RemoveMemberPartyCommand(), { playerId, worldRoomId });
    }
    report(
        worldRoomId: string,
        revision: number,
        updates: (Pick<PartyMemberInfo, "playerId"> & Partial<PartyMemberInfo>)[]
    ) {
        return dispatchForResult(this.dispatcher, new ReportPartyCommand(), {
            worldRoomId,
            revision,
            updates,
        });
    }
    requestJoin(fromPlayerId: string, fromName: string) {
        return dispatchForResult(this.dispatcher, new RequestJoinPartyCommand(), {
            fromPlayerId,
            fromName,
        });
    }
    async declineInvite(playerId: string) {
        await this.dispatcher.dispatch(new DeclineInvitePartyCommand(), { playerId });
    }
    prepareDungeon(request: DungeonPartyRequest) {
        return dispatchForResult(this.dispatcher, new PrepareDungeonPartyCommand(), request);
    }
    async notifyDungeonDenied(dungeonCode: string, failures: DungeonFailure[]) {
        await this.dispatcher.dispatch(new NotifyDungeonDeniedPartyCommand(), {
            dungeonCode,
            failures,
        });
    }
    allocateKillReward(request: KillRewardRequest) {
        return dispatchForResult(this.dispatcher, new AllocateKillRewardPartyCommand(), request);
    }
}
