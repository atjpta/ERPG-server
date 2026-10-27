import { Response } from "@/core/response/response.js";
import { NpcErrorCode } from "@/modules/npcs/enums/npc-error-code.enum.js";
import type { NpcFunctionType } from "@/modules/npcs/schemas/npc-function.schema.js";
import type { OpenNpcFunction } from "@/modules/npcs/types/npc-function-check.type.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import {
    NpcFunctionSessionState,
    type NpcFunctionSessionProps,
} from "@/modules/npcs/state/npc-function-session.state.js";

/** Người chơi trong room, chỉ cần biết đứng ở đâu (`PlayerWorldState`). */
type PlayersInRange = {
    get(playerId: string): { isNear(x: number, y: number, range: number): boolean } | undefined;
};

/** Quản lý chức năng NPC đang mở của một world room, theo playerId (mỗi player một chức năng). */
export class NpcFunctionSessionManager {
    private readonly sessions = new Map<string, NpcFunctionSessionState>();

    get size(): number {
        return this.sessions.size;
    }

    /** Mở chức năng cho player; đang mở chức năng khác thì thay bằng cái mới. */
    open(playerId: string, props: NpcFunctionSessionProps): NpcFunctionSessionState {
        const session = new NpcFunctionSessionState(props);
        this.sessions.set(playerId, session);
        return session;
    }

    get(playerId: string): NpcFunctionSessionState | undefined {
        return this.sessions.get(playerId);
    }

    /** Đóng chức năng của player (rời room, đi xa). */
    drop(playerId: string): void {
        this.sessions.delete(playerId);
    }

    /**
     * Player có đang mở chức năng NPC loại `type` và còn đứng gần NPC không. Kiểm bằng vị trí hiện tại của player (không chờ tick):
     * chưa mở / mở chức năng khác → `NPC_FUNCTION_NOT_OPEN`; đã bước ra khỏi tầm → `TOO_FAR` (và đóng chức năng).
     */
    check(
        playerId: string,
        type: NpcFunctionType,
        players: PlayersInRange
    ): Response<OpenNpcFunction> {
        const session = this.sessions.get(playerId);
        const player = players.get(playerId);
        if (!session || !player || session.type !== type) {
            return Response.error(NpcErrorCode.NPC_FUNCTION_NOT_OPEN);
        }
        if (!session.isNear(player)) {
            this.sessions.delete(playerId);
            return Response.error(PlayerErrorCode.TOO_FAR);
        }
        return Response.success({ functionId: session.functionId, config: session.config });
    }

    /** Mỗi tick: ai đã đi quá xa NPC hoặc đã rời room thì đóng chức năng (client không được báo, lần dùng kế tiếp mới nhận lỗi). */
    tick(players: PlayersInRange): void {
        for (const [playerId, session] of this.sessions) {
            const player = players.get(playerId);
            if (!player || !session.isNear(player)) this.sessions.delete(playerId);
        }
    }

    [Symbol.iterator](): IterableIterator<[string, NpcFunctionSessionState]> {
        return this.sessions.entries();
    }
}
