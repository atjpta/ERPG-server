import { PLAYER_BASE_STATS } from "@/modules/auth/constants/player.constant.js";
import type { Direction } from "@/modules/auth/enums/player.enum.js";
import { playerService } from "@/modules/auth/user/services/player.service.js";
import type { GameMap } from "@/modules/maps/entities/game-map.entity.js";
import { mapService } from "@/modules/maps/user/services/map.service.js";
import { BasePlayerRoom, type PlayerClient } from "@/rooms/base/base-player.room.js";
import { MoveInput } from "@/rooms/world/schema/move.input.js";
import { PlayerState, WorldState } from "@/rooms/world/schema/world.state.js";
import { applyMove } from "@/rooms/world/simulation/movement.step.js";
import type { StepContext } from "colyseus";

/**
 * Tick rate của mô phỏng — client nhận qua handshake để predict cùng `dt`.
 * 20Hz đủ cho top-down pixel; client nội suy player khác, tự predict chính mình.
 */
const TICK_RATE = 20;
const RECONNECT_SECONDS = 20;

export interface WorldRoomOptions {
    mapCode: string;
}

/** Dữ liệu chỉ server giữ (không sync xuống client). */
interface ServerPlayer {
    playerId: string;
    moveSpeed: number;
    mp: number;
}

/**
 * 1 room = 1 kênh của 1 map. `filterBy(["mapCode"])` → client join cùng `mapCode` vào chung room
 * tới khi đầy (`maxPlayersPerChannel`), đầy thì Colyseus tự tạo room mới (kênh 2, 3...).
 *
 * Di chuyển theo **Colyseus Netcode** (https://docs.colyseus.io/netcode):
 * - Client gửi `MoveInput` mỗi fixed step qua `room.input()`, server buffer theo từng client.
 * - `setFixedTimestep` chạy `applyMove` (hàm dùng chung với client) — mỗi step lấy đúng 1 input
 *   của mỗi player (`next()`), ack số input đã xử lý được framework tự gửi về client để reconcile.
 * - Client: `predict.reconciler` cho player của mình, lerp cho player khác.
 * Chưa có va chạm tile (collision layer).
 */
export class WorldRoom extends BasePlayerRoom<{
    state: WorldState;
    client: PlayerClient;
    input: MoveInput;
}> {
    state = new WorldState();

    inputs = this.defineInput(MoveInput, {
        // Không tin client: ép về -1..1 (sanitize sửa giá trị, không reject).
        sanitize: { moveX: [-1, 1], moveY: [-1, 1] },
    });

    private map!: GameMap;
    private readonly serverPlayers = new Map<string, ServerPlayer>();

    async onCreate(options: WorldRoomOptions) {
        this.map = await mapService.getActiveByCodeOrFail(options.mapCode);
        this.maxClients = this.map.maxPlayersPerChannel;
        this.state.mapCode = this.map.code;
        this.setFixedTimestep((ctx) => this.step(ctx), TICK_RATE);
    }

    async onJoin(client: PlayerClient) {
        const { playerId } = client.auth;
        const player = await playerService.getPlayableOrFail(playerId);
        if (player.mapCode !== this.map.code) {
            throw new Error(`Player is on map "${player.mapCode}", not "${this.map.code}"`);
        }

        const state = new PlayerState();
        state.playerId = player.id;
        state.name = player.name;
        state.level = player.level;
        state.x = player.x;
        state.y = player.y;
        state.direction = player.direction;
        state.moving = false;
        state.hp = player.hp;
        state.maxHp = PLAYER_BASE_STATS.maxHp;

        this.state.players.set(client.sessionId, state);
        this.serverPlayers.set(client.sessionId, {
            playerId: player.id,
            moveSpeed: PLAYER_BASE_STATS.moveSpeed,
            mp: player.mp,
        });

        // Subscribe kick (ban/xoá/logout) + đá kết nối cũ của cùng player ở mọi room/process.
        await this.registerOnlinePlayer(client);
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
        await this.unregisterOnlinePlayer(client);
        await this.saveAndRemove(client.sessionId);
    }

    async onDispose() {
        await Promise.all([...this.serverPlayers.keys()].map((id) => this.saveAndRemove(id)));
    }

    /** 1 fixed step: mỗi player tiêu thụ đúng 1 input (shared world — không over-step ai). */
    private step(ctx: StepContext) {
        for (const [sessionId, player] of this.serverPlayers) {
            const state = this.state.players.get(sessionId);
            if (!state) continue;

            const cmd = this.inputs.get(sessionId).next();
            applyMove(state, cmd ?? { moveX: 0, moveY: 0 }, this.map, player.moveSpeed, ctx.dt);
        }
    }

    private async saveAndRemove(sessionId: string) {
        const player = this.serverPlayers.get(sessionId);
        const state = this.state.players.get(sessionId);
        this.serverPlayers.delete(sessionId);
        this.state.players.delete(sessionId);
        if (!player || !state) return;

        try {
            await playerService.saveState(player.playerId, {
                mapCode: this.map.code,
                x: state.x,
                y: state.y,
                direction: state.direction as Direction,
                hp: state.hp,
                mp: player.mp,
            });
        } catch (err) {
            console.error(`[WorldRoom] Save player ${player.playerId} failed:`, err);
        }
    }
}
