import type { NpcFunction, NpcFunctionType } from "@/modules/npcs/schemas/npc-function.schema.js";

/** Global → world (rpc `checkNpcFunction`): người chơi có đang mở chức năng NPC loại `type` và còn đứng gần NPC không. */
export interface NpcFunctionCheckRequest {
    playerId: string;
    type: NpcFunctionType;
}

/** Kết quả `checkNpcFunction` khi đang mở đúng chức năng: `config` để lệnh ở global biết được phép làm gì (vd nhóm công thức của `crafting`). */
export interface OpenNpcFunction {
    functionId: string;
    config: NpcFunction["config"];
}
