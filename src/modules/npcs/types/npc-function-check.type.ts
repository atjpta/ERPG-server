import type { NpcFunctionType } from "@/modules/npcs/schemas/npc-function.schema.js";

/** Global → world (rpc `checkNpcFunction`): người chơi có đang mở chức năng NPC loại `type` và còn đứng gần NPC không. */
export interface NpcFunctionCheckRequest {
    playerId: string;
    type: NpcFunctionType;
}
