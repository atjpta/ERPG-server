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
import { AllocateAttributesWorldCommand } from "@/rooms/world/commands/allocate-attributes.world.command.js";
import {
    DisassembleItemsWorldCommand,
    EnhanceEquipmentWorldCommand,
    EquipItemWorldCommand,
    LockItemWorldCommand,
    MoveItemWorldCommand,
    RefineEquipmentWorldCommand,
    UnequipItemWorldCommand,
} from "@/rooms/world/commands/inventory.world.command.js";
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
        if (player) inventoryWorldService.send(client, player);
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
