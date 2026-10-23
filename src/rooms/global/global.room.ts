import { z } from "zod";
import { KickReason } from "@/core/enums/kick-reason.enum.js";
import { KICK_CLOSE_CODES, type PlayerClient } from "@/core/rooms/base-player.room.js";
import { createRpcRunner } from "@/core/rooms/room.integration.js";
import { SdkRoom } from "@/core/rooms/sdk-room.decorator.js";
import { loadRoomMessages } from "@/core/utils/load-room-messages.util.js";
import { AuthenticatedPlayerRoom } from "@/rooms/authenticated-player.room.js";
import { ApplyPlayerChangesGlobalCommand } from "@/rooms/global/modules/player-data/commands/apply-player-changes.global.command.js";
import { SyncPlayersGlobalCommand } from "@/rooms/global/modules/player-data/commands/sync-players.global.command.js";
import { playerDataGlobalService } from "@/rooms/global/modules/player-data/services/player-data.global.service.js";
import { LaunchDungeonGlobalCommand } from "@/rooms/global/modules/dungeon-launch/commands/launch-dungeon.global.command.js";
import { GlobalState } from "@/rooms/global/schemas/global.state.js";
import { AttachWorldGlobalCommand } from "@/rooms/global/modules/world-registry/commands/attach-world.global.command.js";
import { DetachWorldGlobalCommand } from "@/rooms/global/modules/world-registry/commands/detach-world.global.command.js";
import { HeartbeatWorldGlobalCommand } from "@/rooms/global/modules/world-registry/commands/heartbeat-world.global.command.js";
import type { GlobalRoomOptions } from "@/rooms/global/types/global-room.type.js";
import { PruneRegistryGlobalCommand } from "@/rooms/global/modules/world-registry/commands/prune-registry.global.command.js";
import { playerService } from "@/modules/player/services/player.service.js";
import { PartyNotice } from "@/rooms/global/global.shared.js";
import { friendGlobalService } from "@/rooms/global/modules/friend/services/friend.global.service.js";
import { partyGlobalService } from "@/rooms/global/modules/party/services/party.global.service.js";

const RECONNECT_SECONDS = 20;
const PRESENCE_PRUNE_MS = 30_000;

const messages = await loadRoomMessages(new URL(".", import.meta.url));

@SdkRoom({
    joins: [
        {
            room: "global",
            options: z.object({ serverId: z.string() }),
            doc: 'Vào bằng `JoinOrCreate("global", { serverId })`: mỗi game server một global room (chat, party); `serverId` phải là server của nhân vật đang đăng nhập. Giữ kết nối suốt phiên chơi, song song với world room; mất mạng được giữ chỗ để reconnect.',
        },
    ],
})
export class GlobalRoom extends AuthenticatedPlayerRoom<{
    client: PlayerClient;
    state: GlobalState;
}> {
    messages = messages;
    maxClients = 100_000;
    autoDispose = false;

    /** Hồ sơ người chơi, presence, party: chỉ ở server, không sync (xem `GlobalState`). */
    state = new GlobalState();

    /**
     * Global nằm cạnh kết nối world của cùng player (world room mới vào lúc đổi map không được đá nó) nên không bị
     * đá khi đăng nhập trùng ở room khác; vẫn bị đá khi ban/xoá/logout. Đăng nhập trùng ngay trong global được xử lý
     * lúc join (kết nối cũ bị thay).
     */
    protected override shouldKickFor(reason: KickReason) {
        return reason !== KickReason.DUPLICATE_LOGIN;
    }

    async onCreate(options: GlobalRoomOptions) {
        this.bindServer(options);
        this.roomId = options.serverId;
        const { dispatcher } = this;
        this.clock.setInterval(() => {
            void dispatcher.dispatch(new PruneRegistryGlobalCommand());
        }, PRESENCE_PRUNE_MS);
    }

    async onJoin(client: PlayerClient) {
        const { playerId, serverId } = client.auth;
        if (serverId !== this.serverId) throw new Error("Wrong game server");

        await playerService.assertPlayableOrFail(playerId);
        const previous = this.sessionOf.get(playerId);
        this.sessionOf.set(playerId, client.sessionId);
        await playerDataGlobalService.connect(this, playerId);
        if (previous) {
            this.clients.get(previous)?.leave(KICK_CLOSE_CODES[KickReason.DUPLICATE_LOGIN]);
        }
        await this.registerOnlinePlayer(client, { kickDuplicateLogins: false });
        await playerDataGlobalService.sendInitial(this, client);
        await friendGlobalService.connect(this, playerId);
    }

    async onLeave(client: PlayerClient) {
        await this.unregisterOnlinePlayer(client);
        const { playerId } = client.auth;
        // Kết nối cũ bị thay thế không được xoá phiên của kết nối mới.
        if (this.sessionOf.get(playerId) !== client.sessionId) return;
        this.sessionOf.delete(playerId);
        friendGlobalService.disconnect(this, playerId);
        // Kết nối global kết thúc (sau thời gian chờ reconnect) = rời party.
        const party = this.state.parties.getPartyByPlayerId(playerId);
        if (party) partyGlobalService.removeMember(this, party, playerId, PartyNotice.MEMBER_LEFT);
        await playerDataGlobalService.releaseIfIdle(this, playerId);
    }

    async onDrop(client: PlayerClient) {
        // Mất mạng (hay gặp trên mobile) — giữ chỗ cho reconnect; hết hạn mới `onLeave` và rời party.
        await this.allowReconnection(client, RECONNECT_SECONDS);
    }

    async onReconnect(client: PlayerClient) {
        await this.verifyReconnect(client);
    }

    // ---- RPC: room khác gọi bằng `callRoom(roomId, XCommand, payload)`; chỉ command trong danh sách chạy được ----

    readonly runRpc = createRpcRunner(this, [
        AttachWorldGlobalCommand,
        DetachWorldGlobalCommand,
        HeartbeatWorldGlobalCommand,
        LaunchDungeonGlobalCommand,
        SyncPlayersGlobalCommand,
        ApplyPlayerChangesGlobalCommand,
    ]);
}
