import { Dispatcher } from "@colyseus/command";
import type { Rewind } from "colyseus";
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
} from "@/rooms/world/commands/content.world.command.js";
import { dialogueWorldService } from "@/rooms/world/services/dialogue.world.service.js";
import { questWorldService } from "@/rooms/world/services/quest.world.service.js";
import { attributeWorldService } from "@/rooms/world/services/attribute.world.service.js";
import { inventoryWorldService } from "@/rooms/world/services/inventory.world.service.js";
import { WorldClientMessage } from "@/rooms/world/world.message.js";
import { MoveWorldInput } from "@/rooms/world/schema/move.world.input.js";
import { WorldState } from "@/rooms/world/schema/world.state.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import { WORLD_TICK_RATE } from "@/rooms/world/utils/tick.world.util.js";
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
        [WorldClientMessage.QUEST_ABANDON]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new QuestAbandonWorldCommand(), { client, payload });
        },
        [WorldClientMessage.PREVIEW_DISASSEMBLE]: (client: PlayerClient, payload: unknown) => {
            void this.dispatcher.dispatch(new PreviewDisassembleWorldCommand(), {
                client,
                payload,
            });
        },
    };

    map!: GameMap;
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

    isLeavingSession(sessionId: string): boolean {
        return this.leavingSessions.has(sessionId);
    }
}
