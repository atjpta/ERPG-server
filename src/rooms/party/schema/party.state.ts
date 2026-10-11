import { MapSchema, Schema, type } from "@colyseus/schema";

/** Thành viên party hiển thị cho mọi người trong party (HP, level, map đang đứng). */
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

    constructor(props: {
        playerId: string;
        name: string;
        level: number;
        hp: number;
        maxHp: number;
        mapCode: string;
        inWorld: boolean;
        inDungeon: boolean;
    }) {
        super();
        this.playerId = props.playerId;
        this.name = props.name;
        this.level = props.level;
        this.hp = props.hp;
        this.maxHp = props.maxHp;
        this.mapCode = props.mapCode;
        this.inWorld = props.inWorld;
        this.inDungeon = props.inDungeon;
    }
}

export class PartyState extends Schema {
    @type("string") leaderPlayerId = "";
    @type({ map: PartyMemberState }) members = new MapSchema<PartyMemberState>();
}
