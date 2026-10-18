import { SdkRoom } from "@/core/rooms/sdk-room.decorator.js";
import { KickReason } from "@/core/enums/kick-reason.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { createRpcRunner } from "@/core/rooms/room.integration.js";
import { loadRoomMessages } from "@/core/utils/load-room-messages.util.js";
import { AuthenticatedPlayerRoom } from "@/rooms/authenticated-player.room.js";
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
import { PartyState } from "@/rooms/party/schemas/party.state.js";
import type { PartyRoomOptions } from "@/rooms/party/types/party-room.type.js";
import { Dispatcher } from "@colyseus/command";
const messages = await loadRoomMessages(new URL(".", import.meta.url));

@SdkRoom({
    joins: [
        {
            room: "party",
            options: null,
            doc: "Vào bằng `JoinById(roomId)`: `roomId` lấy từ message `party` của world room hoặc `partyRoomId` của lời mời.",
        },
    ],
})
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

    // ---- RPC: room khác gọi bằng `callRoom(roomId, XCommand, payload)`; chỉ command trong danh sách chạy được ----

    readonly runRpc = createRpcRunner(this, [
        AttachWorldPartyCommand,
        DetachWorldPartyCommand,
        RemoveMemberPartyCommand,
        ReportPartyCommand,
        RequestJoinPartyCommand,
        DeclineInvitePartyCommand,
        PrepareDungeonPartyCommand,
        NotifyDungeonDeniedPartyCommand,
        AllocateKillRewardPartyCommand,
    ]);
}
