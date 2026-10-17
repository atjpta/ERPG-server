import type { WorldRoomOptions } from "@/rooms/world/types/world-room.type.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { dispatchForResult } from "@/core/utils/dispatch-result.util.js";
import { loadRoomMessages } from "@/core/utils/load-room-messages.util.js";
import type { GameMap } from "@/modules/maps/entities/game-map.entity.js";
import { visitedFlagKey } from "@/modules/maps/services/teleport.service.js";
import { AuthenticatedPlayerRoom } from "@/rooms/index.room.js";
import type { PartyMembershipEvent } from "@/rooms/party/party.shared.js";
import { OnCreateWorldCommand } from "@/rooms/world/commands/on-create.world.command.js";
import { JoinPlayerWorldCommand } from "@/rooms/world/commands/on-join.world.command.js";
import { LeavePlayerWorldCommand } from "@/rooms/world/commands/on-leave.world.command.js";
import { dialogueWorldService } from "@/rooms/world/modules/content/services/dialogue.world.service.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import type { DungeonRuntime } from "@/rooms/world/modules/dungeons/services/dungeon.world.service.js";
import { dungeonWorldService } from "@/rooms/world/modules/dungeons/services/dungeon.world.service.js";
import { PartyCheckDungeonWorldCommand } from "@/rooms/world/modules/dungeons/commands/party-check-dungeon.world.command.js";
import { PartyEnterDungeonWorldCommand } from "@/rooms/world/modules/dungeons/commands/party-enter-dungeon.world.command.js";
import { inventoryWorldService } from "@/rooms/world/modules/inventory/services/inventory.world.service.js";
import type { MonsterWorldState } from "@/rooms/world/modules/monsters/schemas/monster.world.state.js";
import { PartyAttachWorldCommand } from "@/rooms/world/modules/players/commands/party-attach.world.command.js";
import { PartyDeliverInviteWorldCommand } from "@/rooms/world/modules/players/commands/party-deliver-invite.world.command.js";
import { PartyDeliverJoinRequestWorldCommand } from "@/rooms/world/modules/players/commands/party-deliver-join-request.world.command.js";
import { PartyDetachWorldCommand } from "@/rooms/world/modules/players/commands/party-detach.world.command.js";
import { PartySetPlayerPartyWorldCommand } from "@/rooms/world/modules/players/commands/party-set-player-party.world.command.js";
import { MoveWorldInput } from "@/rooms/world/modules/players/schemas/move.world.input.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { attributeWorldService } from "@/rooms/world/modules/players/services/attribute.world.service.js";
import type { MoveBounds } from "@/rooms/world/modules/players/simulation/movement.step.js";
import { monsterKillWorldService } from "@/rooms/world/modules/rewards/services/monster-kill.world.service.js";
import { rewardTasksWorldService } from "@/rooms/world/modules/rewards/services/reward-tasks.world.service.js";
import { WorldState } from "@/rooms/world/schemas/world.state.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import { WORLD_TICK_RATE } from "@/rooms/world/utils/tick.world.util.js";
import type {
    PartyInviteReceivedMessage,
    PartyJoinRequestMessage,
} from "@/rooms/world/types/world-message.type.js";
import { Dispatcher } from "@colyseus/command";
import type { Rewind } from "colyseus";
const RECONNECT_SECONDS = 20;

const messages = await loadRoomMessages(new URL(".", import.meta.url));

export class WorldRoom extends AuthenticatedPlayerRoom<{
    state: WorldState;
    client: PlayerClient;
    input: MoveWorldInput;
}> {
    messages = messages;
    dispatcher = new Dispatcher(this);
    state = new WorldState();
    readonly tickRate = WORLD_TICK_RATE;

    inputs = this.defineInput(MoveWorldInput, {
        // Giữ tối đa 3.2 giây input ở 40Hz khi server hụt tick; không tin giá trị từ client.
        bufferMaxSize: 128,
        // Sanitize sửa giá trị sai thành giá trị hợp lệ, không reject input.
        sanitize: { moveX: [-1, 1], moveY: [-1, 1] },
    });

    map!: GameMap;
    /** Chỉ có ở room dungeon. */
    dungeon?: DungeonRuntime;

    get isDungeon(): boolean {
        return this.dungeon !== undefined;
    }

    /** Vùng chặn hiệu lực để di chuyển: địa hình của map, cộng cổng chắn khi đang ở dungeon. */
    get moveBounds(): MoveBounds {
        return this.dungeon?.bounds ?? this.map;
    }
    rewind!: Rewind;
    private readonly leavingSessions = new Set<string>();

    onMonsterKilled(sessionId: string, player: PlayerWorldState, monster: MonsterWorldState): void {
        monsterKillWorldService.grant(this, sessionId, player, monster);
    }

    async onCreate(options: WorldRoomOptions) {
        await this.dispatcher.dispatch(new OnCreateWorldCommand(), options);
    }

    async onJoin(client: PlayerClient) {
        await this.dispatcher.dispatch(new JoinPlayerWorldCommand(), {
            sessionId: client.sessionId,
            playerId: client.auth.playerId,
        });

        // Subscribe kick (ban/xoá/logout) + đá kết nối cũ của cùng player ở mọi room/process.
        await this.registerOnlinePlayer(client);

        const player = this.state.players.get(client.sessionId);
        if (player) {
            // Đã đến map này → về sau teleport tới được.
            player.flags[visitedFlagKey(this.map.code)] = true;
            if (this.isDungeon) dungeonWorldService.onPlayerJoined(this, player);
            await this.dispatcher.dispatch(new PartyAttachWorldCommand(), { player });
            inventoryWorldService.send(client, player);
            attributeWorldService.send(client, player);
            questWorldService.sendInitial(this, client, player);
        }
    }

    async onDrop(client: PlayerClient) {
        // Mất mạng (hay gặp trên mobile) — giữ chỗ cho reconnect. Không có input mới thì
        // `next()` trả undefined → player tự đứng yên.
        await this.allowReconnection(client, RECONNECT_SECONDS);
    }

    async onReconnect(client: PlayerClient) {
        await this.verifyReconnect(client);
    }

    async onLeave(client: PlayerClient) {
        this.leavingSessions.add(client.sessionId);
        dialogueWorldService.drop(this, client.sessionId);
        await rewardTasksWorldService.wait(this, client.sessionId);
        const leaving = this.state.players.get(client.sessionId);
        if (leaving)
            await this.dispatcher.dispatch(new PartyDetachWorldCommand(), { player: leaving });
        await this.unregisterOnlinePlayer(client);
        await worldService.waitForCheckpoint(this);
        await this.dispatcher.dispatch(new LeavePlayerWorldCommand(), {
            sessionId: client.sessionId,
        });
    }

    async onDispose() {
        for (const sessionId of this.state.players.keys()) this.leavingSessions.add(sessionId);
        await rewardTasksWorldService.wait(this);
        await worldService.waitForCheckpoint(this);
        await Promise.all(
            [...this.state.players.keys()].map((sessionId) =>
                this.dispatcher.dispatch(new LeavePlayerWorldCommand(), { sessionId })
            )
        );
        this.dispatcher.stop();
    }

    // ---- RPC: gọi từ room khác qua matchMaker.remoteRoomCall; mỗi RPC chạy trong một command ----

    async partySetPlayerParty(event: PartyMembershipEvent) {
        await this.dispatcher.dispatch(new PartySetPlayerPartyWorldCommand(), event);
    }
    partyCheckDungeon(playerId: string, dungeonCode: string, retry: boolean) {
        return dispatchForResult(this.dispatcher, new PartyCheckDungeonWorldCommand(), {
            playerId,
            dungeonCode,
            retry,
        });
    }
    partyEnterDungeon(
        playerId: string,
        dungeonCode: string,
        instanceId: string,
        spawnId: string,
        retry = false
    ) {
        return dispatchForResult(this.dispatcher, new PartyEnterDungeonWorldCommand(), {
            playerId,
            dungeonCode,
            instanceId,
            spawnId,
            retry,
        });
    }
    partyDeliverJoinRequest(leaderId: string, message: PartyJoinRequestMessage) {
        return dispatchForResult(this.dispatcher, new PartyDeliverJoinRequestWorldCommand(), {
            leaderId,
            message,
        });
    }
    partyDeliverInvite(playerId: string, message: PartyInviteReceivedMessage) {
        return dispatchForResult(this.dispatcher, new PartyDeliverInviteWorldCommand(), {
            playerId,
            message,
        });
    }

    isLeavingSession(sessionId: string): boolean {
        return this.leavingSessions.has(sessionId);
    }
}
