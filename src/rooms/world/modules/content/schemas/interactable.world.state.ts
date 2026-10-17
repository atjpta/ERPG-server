import { Schema, type } from "@colyseus/schema";

/** Vật thể tương tác được (portal, thu thập, biển báo). `active = false` khi vừa bị thu thập, chờ hồi lại. */
export class InteractableWorldState extends Schema {
    @type("string") id: string;
    @type("string") kind: string;
    @type("float32") x: number;
    @type("float32") y: number;
    @type("boolean") active = true;
    /** Diện mạo (`InteractableCode`); rỗng = client vẽ mặc định. */
    @type("string") code = "";

    constructor(props: { id: string; kind: string; x: number; y: number; code?: string }) {
        super();
        this.id = props.id;
        this.kind = props.kind;
        this.code = props.code ?? "";
        this.x = props.x;
        this.y = props.y;
    }
}
