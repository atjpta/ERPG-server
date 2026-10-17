import { Schema, type } from "@colyseus/schema";

/**
 * Input di chuyển client → server, 1 frame / 1 fixed step (Colyseus Netcode `defineInput`).
 * Input schema phải phẳng: chỉ field primitive.
 */
export class MoveWorldInput extends Schema {
    @type("int8") moveX: -1 | 0 | 1;
    @type("int8") moveY: -1 | 0 | 1;
    @type("boolean") attack: boolean;
    @type("boolean") dash: boolean;
    /** Skill chủ động dùng ở tick này: số thứ tự (từ 1) trong các skill chủ động player sở hữu, 0 = không. Chỉ có hiệu lực 1 tick. */
    @type("uint8") skill: number;
    @type("boolean") targetNext: boolean;
    @type("boolean") targetUnlock: boolean;
}
