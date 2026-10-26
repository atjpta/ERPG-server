import { Schema, type } from "@colyseus/schema";

/** NPC hoặc vật thể đứng cố định trong map — dựng 1 lần lúc tạo room từ `game_maps.npcs`. */
export class NpcWorldState extends Schema {
    /** Id slot trong map: client gửi `interactNpc { id }` theo id này. */
    @type("string") id: string;
    @type("string") code: string;
    @type("float32") x: number;
    @type("float32") y: number;
    /** NPC nhìn trái / phải; cổng chỉ hướng mũi tên lên / xuống / trái / phải. */
    @type("string") direction: string;
    /** Vật thể thu thập đã bị nhặt thì `false` cho tới khi hồi lại; NPC thường luôn `true`. */
    @type("boolean") active = true;

    constructor(props: { id: string; code: string; x: number; y: number; direction: string }) {
        super();
        this.id = props.id;
        this.code = props.code;
        this.x = props.x;
        this.y = props.y;
        this.direction = props.direction;
    }
}
