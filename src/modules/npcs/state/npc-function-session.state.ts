import type { NpcFunction, NpcFunctionType } from "@/modules/npcs/schemas/npc-function.schema.js";

/** Đứng xa hơn bán kính của NPC cộng chừng này thì chức năng không còn dùng được. */
export const NPC_FUNCTION_RANGE_MARGIN = 0.5;

export interface NpcFunctionSessionProps {
    npcCode: string;
    /** Id slot của NPC / vật thể đã mở chức năng. */
    slotId: string;
    functionId: string;
    type: NpcFunctionType;
    /** `config` của chức năng đang mở (vd nhóm công thức của `crafting`) — lệnh ở global đọc lại để biết được phép làm gì. */
    config: NpcFunction["config"];
    /** Vị trí NPC lúc mở và bán kính tương tác của NPC đó. */
    x: number;
    y: number;
    radius: number;
}

/** Chức năng NPC mà một player đang mở (shop, cường hoá...). Chỉ ở server: client chỉ nhận `npcFunctionOpen`. */
export class NpcFunctionSessionState {
    readonly npcCode: string;
    readonly slotId: string;
    readonly functionId: string;
    readonly type: NpcFunctionType;
    readonly config: NpcFunction["config"];
    readonly x: number;
    readonly y: number;
    readonly radius: number;

    constructor(props: NpcFunctionSessionProps) {
        this.npcCode = props.npcCode;
        this.slotId = props.slotId;
        this.functionId = props.functionId;
        this.type = props.type;
        this.config = props.config;
        this.x = props.x;
        this.y = props.y;
        this.radius = props.radius;
    }

    /** Player còn đứng trong tầm của NPC (bán kính tương tác cộng `NPC_FUNCTION_RANGE_MARGIN`) không. */
    isNear(player: { isNear(x: number, y: number, range: number): boolean }): boolean {
        return player.isNear(this.x, this.y, this.radius + NPC_FUNCTION_RANGE_MARGIN);
    }
}
