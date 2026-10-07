import { Schema, type } from "@colyseus/schema";

/** NPC đứng cố định trong map — dựng 1 lần lúc tạo room từ `game_maps.npcs`. */
export class NpcWorldState extends Schema {
    @type("string") code: string;
    @type("float32") x: number;
    @type("float32") y: number;
    @type("string") direction: string;

    constructor(props: { code: string; x: number; y: number; direction: string }) {
        super();
        this.code = props.code;
        this.x = props.x;
        this.y = props.y;
        this.direction = props.direction;
    }
}
