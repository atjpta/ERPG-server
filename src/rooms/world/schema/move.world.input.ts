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
    @type("boolean") targetNext: boolean;
    @type("boolean") targetUnlock: boolean;
}
