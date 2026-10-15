import { Dispatcher } from "@colyseus/command";
import type { Rewind } from "colyseus";
import type { DungeonRuntime } from "@/rooms/world/services/dungeon.world.service.js";
import type { GameMap } from "@/modules/maps/entities/game-map.entity.js";
import { BasePlayerRoom, type PlayerClient } from "@/rooms/base/base-player.room.js";
import {
    OnCreateWorldCommand,
    WorldRoomOptions,
} from "@/rooms/world/commands/on-create.world.command.js";
import { JoinPlayerWorldCommand } from "@/rooms/world/commands/on-join.world.command.js";
import { LeavePlayerWorldCommand } from "@/rooms/world/commands/on-leave.world.command.js";
import {
    AllocateAttributesWorldCommand,
    PreviewAttributesWorldCommand,
} from "@/rooms/world/commands/allocate-attributes.world.command.js";
import {
    DisassembleItemsWorldCommand,
    EnhanceEquipmentWorldCommand,
    EquipItemWorldCommand,
    LockItemWorldCommand,
    UseItemWorldCommand,
    MoveItemWorldCommand,
    PreviewDisassembleWorldCommand,
    PreviewUpgradeWorldCommand,
    RefineEquipmentWorldCommand,
    UnequipItemWorldCommand,
} from "@/rooms/world/commands/inventory.world.command.js";
import {
    DialogueChooseWorldCommand,
    DialogueCloseWorldCommand,
    InteractNpcWorldCommand,
    InteractWorldCommand,
    QuestAbandonWorldCommand,
    QuestListWorldCommand,
    QuestPreviewWorldCommand,
    TeleportToWorldCommand,
} from "@/rooms/world/commands/content.world.command.js";
import type { MoveBounds } from "@/rooms/world/simulation/movement.step.js";
import {
    PartyCreateWorldCommand,
    PartyDeclineWorldCommand,
} from "@/rooms/world/commands/party.world.command.js";
import { partyWorldService } from "@/rooms/world/services/party.world.service.js";
import type {
    PartyInviteReceivedMessage,
    PartyJoinRequestMessage,
} from "@/rooms/world/world.message.js";
import { playerViewWorldService } from "@/rooms/world/services/player-view.world.service.js";
import { PlayerTargetSchema } from "@/rooms/world/validators/inventory.world.validator.js";
import type { PartyLootMode, PartyMemberInfo } from "@/modules/party/schemas/party.schema.js";
import { visitedFlagKey } from "@/modules/maps/utils/teleport.util.js";
import { dungeonWorldService } from "@/rooms/world/services/dungeon.world.service.js";
import { dialogueWorldService } from "@/rooms/world/services/dialogue.world.service.js";
import { questWorldService } from "@/rooms/world/services/quest.world.service.js";
import { attributeWorldService } from "@/rooms/world/services/attribute.world.service.js";
import { inventoryWorldService } from "@/rooms/world/services/inventory.world.service.js";
import { WorldClientMessage } from "@/rooms/world/world.message.js";
import { MoveWorldInput } from "@/rooms/world/schema/move.world.input.js";
import { WorldState } from "@/rooms/world/schema/world.state.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import { WORLD_TICK_RATE } from "@/rooms/world/utils/tick.world.util.js";
import { sendSkillConfigs } from "@/rooms/world/services/skill-config.world.service.js";
const RECONNECT_SECONDS = 20;

export class WorldRoom extends BasePlayerRoom<{
    state: WorldState;
    client: PlayerClient;
    input: MoveWorldInput;
}> {
    dispatcher = new Dispatcher(this);
    state = new WorldState();
    readonly tickRate = WORLD_TICK_RATE;

    inputs = this.defineInput(MoveWorldInput, {
        // Giữ tối đa 3.2 giây input ở 40Hz khi server hụt tick; không tin giá trị từ client.
        bufferMaxSize: 128,
        // Sanitize sửa giá trị sai thành giá trị hợp lệ, không reject input.
        sanitize: { moveX: [-1, 1], moveY: [-1, 1] },
    });

    messages = {
        [WorldClientMessage.REQUEST_SKILL_CONFIGS]: (client: PlayerClient) => {
            sendSkillConfigs(client);
        },
        [WorldClientMessage.ALLOCATE_ATTRIBUTES]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new AllocateAttributesWorldCommand(), {
                client,
                payload,
            });
        },
        [WorldClientMessage.PREVIEW_ATTRIBUTES]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new PreviewAttributesWorldCommand(), { client, payload });
        },
        [WorldClientMessage.EQUIP_ITEM]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new EquipItemWorldCommand(), { client, payload });
        },
        [WorldClientMessage.UNEQUIP_ITEM]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new UnequipItemWorldCommand(), { client, payload });
        },
        [WorldClientMessage.MOVE_ITEM]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new MoveItemWorldCommand(), { client, payload });
        },
        [WorldClientMessage.LOCK_ITEM]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new LockItemWorldCommand(), { client, payload });
        },
        [WorldClientMessage.VIEW_PLAYER]: (client: PlayerClient, payload: unknown) => {
            const parsed = PlayerTargetSchema.safeParse(payload);
            if (parsed.success) playerViewWorldService.view(this, client, parsed.data.playerId);
        },
        [WorldClientMessage.PARTY_REQUEST_JOIN]: (client: PlayerClient, payload: unknown) => {
            const parsed = PlayerTargetSchema.safeParse(payload);
            const player = this.state.players.get(client.sessionId);
            if (parsed.success && player) {
                void partyWorldService.requestJoin(this, client, player, parsed.data.playerId);
            }
        },
        [WorldClientMessage.USE_ITEM]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new UseItemWorldCommand(), { client, payload });
        },
        [WorldClientMessage.ENHANCE_EQUIPMENT]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new EnhanceEquipmentWorldCommand(), { client, payload });
        },
        [WorldClientMessage.REFINE_EQUIPMENT]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new RefineEquipmentWorldCommand(), { client, payload });
        },
        [WorldClientMessage.DISASSEMBLE_ITEMS]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new DisassembleItemsWorldCommand(), { client, payload });
        },
        [WorldClientMessage.PREVIEW_UPGRADE]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new PreviewUpgradeWorldCommand(), { client, payload });
        },
        [WorldClientMessage.INTERACT]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new InteractWorldCommand(), { client, payload });
        },
        [WorldClientMessage.INTERACT_NPC]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new InteractNpcWorldCommand(), { client, payload });
        },
        [WorldClientMessage.DIALOGUE_CHOOSE]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new DialogueChooseWorldCommand(), { client, payload });
        },
        [WorldClientMessage.DIALOGUE_CLOSE]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new DialogueCloseWorldCommand(), { client, payload });
        },
        [WorldClientMessage.QUEST_LIST]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new QuestListWorldCommand(), { client, payload });
        },
        [WorldClientMessage.QUEST_PREVIEW]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new QuestPreviewWorldCommand(), { client, payload });
        },
        [WorldClientMessage.QUEST_ABANDON]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new QuestAbandonWorldCommand(), { client, payload });
        },
        [WorldClientMessage.TELEPORT_TO]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new TeleportToWorldCommand(), { client, payload });
        },
        [WorldClientMessage.PARTY_CREATE]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new PartyCreateWorldCommand(), { client, payload });
        },
        [WorldClientMessage.PARTY_DECLINE]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new PartyDeclineWorldCommand(), { client, payload });
        },
        [WorldClientMessage.DUNGEON_LEAVE]: (client: PlayerClient) => {
            if (this.dungeon) void dungeonWorldService.leaveByClient(this, client);
        },
        [WorldClientMessage.DUNGEON_RETRY]: (client: PlayerClient) => {
            const player = this.state.players.get(client.sessionId);
            if (this.dungeon && player) void partyWorldService.retryDungeon(this, client, player);
        },
        [WorldClientMessage.PREVIEW_DISASSEMBLE]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new PreviewDisassembleWorldCommand(), {
                client,
                payload,
            });
        },
    };

    map!: GameMap;
    /** Chỉ có ở room dungeon. */
    dungeon?: DungeonRuntime;
    /** Dungeon: map + cổng chắn của chamber đang chơi (đổi khi vào / dọn xong chamber). */
    dungeonBounds?: MoveBounds;

    /** Vùng chặn hiệu lực để di chuyển: địa hình của map, cộng cổng chắn khi đang ở dungeon. */
    get moveBounds(): MoveBounds {
        return this.dungeonBounds ?? this.map;
    }
    rewind!: Rewind;
    private readonly leavingSessions = new Set<string>();

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
            if (this.dungeon) dungeonWorldService.onPlayerJoined(this, player);
            await partyWorldService.onJoin(this, player);
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
        const leaving = this.state.players.get(client.sessionId);
        if (leaving) await partyWorldService.onLeave(this, leaving);
        await this.unregisterOnlinePlayer(client);
        await worldService.waitForCheckpoint(this);
        await this.dispatcher.dispatch(new LeavePlayerWorldCommand(), {
            sessionId: client.sessionId,
        });
    }

    async onDispose() {
        for (const sessionId of this.state.players.keys()) this.leavingSessions.add(sessionId);
        await worldService.waitForCheckpoint(this);
        await Promise.all(
            [...this.state.players.keys()].map((sessionId) =>
                this.dispatcher.dispatch(new LeavePlayerWorldCommand(), { sessionId })
            )
        );
        this.dispatcher.stop();
    }

    // ---- Gọi từ xa bởi party room (matchMaker.remoteRoomCall) ----------------------------------

    partySetPlayerParty(
        playerId: string,
        partyRoomId: string | null,
        lootMode?: PartyLootMode
    ): void {
        partyWorldService.setPlayerParty(this, playerId, partyRoomId, lootMode);
    }

    partyEnterDungeon(
        playerId: string,
        dungeonCode: string,
        instanceId: string,
        spawnId: string,
        retry = false
    ): Promise<string | undefined> {
        return partyWorldService.enterDungeon(
            this,
            playerId,
            dungeonCode,
            instanceId,
            spawnId,
            retry
        );
    }

    partyDeliverJoinRequest(playerId: string, payload: PartyJoinRequestMessage): boolean {
        return partyWorldService.deliverJoinRequest(this, playerId, payload);
    }

    partyDeliverInvite(
        playerId: string,
        payload: PartyInviteReceivedMessage
    ): PartyMemberInfo | null {
        return partyWorldService.deliverInvite(this, playerId, payload);
    }

    isLeavingSession(sessionId: string): boolean {
        return this.leavingSessions.has(sessionId);
    }
}
