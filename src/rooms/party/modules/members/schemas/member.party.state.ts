import type { PartyMemberInfo } from "@/rooms/party/schemas/party.schema.js";
import { Schema, type } from "@colyseus/schema";
export class PartyMemberState extends Schema {
    @type("string") playerId: string;
    @type("string") name: string;
    @type("uint16") level: number;
    @type("uint32") hp: number;
    @type("uint32") maxHp: number;
    @type("string") mapCode: string;
    /** Đang ở trong một world room (false khi vừa đổi map). */
    @type("boolean") inWorld: boolean;
    @type("boolean") inDungeon: boolean;

    constructor(props: PartyMemberInfo) {
        super();
        Object.assign(this, props);
    }
}
