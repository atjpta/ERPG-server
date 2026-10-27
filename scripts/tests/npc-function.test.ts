import { NpcErrorCode } from "@/modules/npcs/enums/npc-error-code.enum.js";
import { NpcFunctionType } from "@/modules/npcs/schemas/npc-function.schema.js";
import { NPC_FUNCTION_RANGE_MARGIN } from "@/modules/npcs/state/npc-function-session.state.js";
import { NpcFunctionSessionManager } from "@/rooms/world/modules/content/managers/npc-function-session.manager.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { Response } from "@/core/response/response.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { check, checkEqual, test } from "./harness.js";

const PLAYER = "player-1";
const NPC = { x: 10, y: 10, radius: 2 };

/** World room giả: chỉ có phần `check` / `tick` cần (danh sách chức năng đang mở + vị trí player). */
function fakeRoom(position: { x: number; y: number } | null) {
    const players = new Map<string, unknown>();
    const player = position && {
        ...position,
        isNear(x: number, y: number, range: number) {
            return Math.hypot(this.x - x, this.y - y) <= range;
        },
    };
    if (player) players.set(PLAYER, player);
    const room = { npcFunctions: new NpcFunctionSessionManager(), state: { players } };
    return { room: room as unknown as WorldRoom, player };
}

const open = (room: WorldRoom, type: NpcFunctionType) =>
    room.npcFunctions.open(PLAYER, {
        npcCode: "blacksmith",
        slotId: "npc_blacksmith",
        functionId: "fn",
        type,
        config: {},
        ...NPC,
    });

const errorCode = (response: Response<unknown>) =>
    Response.isError(response) ? response.errorCode : null;

test("npc function: chưa mở chức năng → NPC_FUNCTION_NOT_OPEN", async () => {
    const { room } = fakeRoom({ x: 10, y: 10 });
    checkEqual(
        errorCode(room.npcFunctions.check(PLAYER, NpcFunctionType.ENHANCE, room.state.players)),
        NpcErrorCode.NPC_FUNCTION_NOT_OPEN,
        "not opened"
    );
});

test("npc function: đang mở đúng loại và đứng gần → cho phép; loại khác → từ chối", async () => {
    const { room } = fakeRoom({ x: 11, y: 10 });
    open(room, NpcFunctionType.ENHANCE);
    check(
        room.npcFunctions.check(PLAYER, NpcFunctionType.ENHANCE, room.state.players).success,
        "same type"
    );
    checkEqual(
        errorCode(room.npcFunctions.check(PLAYER, NpcFunctionType.REFINE, room.state.players)),
        NpcErrorCode.NPC_FUNCTION_NOT_OPEN,
        "other type"
    );
});

test("npc function: đi ra ngoài tầm → TOO_FAR rồi đóng chức năng", async () => {
    const { room, player } = fakeRoom({ x: 10, y: 10 });
    open(room, NpcFunctionType.DISASSEMBLE);
    // sát mép: bán kính + margin vẫn được
    player!.x = NPC.x + NPC.radius + NPC_FUNCTION_RANGE_MARGIN;
    check(
        room.npcFunctions.check(PLAYER, NpcFunctionType.DISASSEMBLE, room.state.players).success,
        "at the edge"
    );
    player!.x += 0.1;
    checkEqual(
        errorCode(room.npcFunctions.check(PLAYER, NpcFunctionType.DISASSEMBLE, room.state.players)),
        PlayerErrorCode.TOO_FAR,
        "out of range"
    );
    checkEqual(
        errorCode(room.npcFunctions.check(PLAYER, NpcFunctionType.DISASSEMBLE, room.state.players)),
        NpcErrorCode.NPC_FUNCTION_NOT_OPEN,
        "closed after leaving"
    );
});

test("npc function: tick đóng chức năng của người đã đi xa hoặc đã rời room", async () => {
    const { room, player } = fakeRoom({ x: 10, y: 10 });
    open(room, NpcFunctionType.ENHANCE);
    room.npcFunctions.tick(room.state.players);
    checkEqual(room.npcFunctions.size, 1, "still near");
    player!.x = 100;
    room.npcFunctions.tick(room.state.players);
    checkEqual(room.npcFunctions.size, 0, "far away");

    open(room, NpcFunctionType.ENHANCE);
    (room.state.players as unknown as Map<string, unknown>).delete(PLAYER);
    room.npcFunctions.tick(room.state.players);
    checkEqual(room.npcFunctions.size, 0, "left the room");
});

test("npc function: mở chức năng khác thì thay cái cũ", async () => {
    const { room } = fakeRoom({ x: 10, y: 10 });
    open(room, NpcFunctionType.ENHANCE);
    open(room, NpcFunctionType.REFINE);
    check(
        room.npcFunctions.check(PLAYER, NpcFunctionType.REFINE, room.state.players).success,
        "new one"
    );
    checkEqual(
        errorCode(room.npcFunctions.check(PLAYER, NpcFunctionType.ENHANCE, room.state.players)),
        NpcErrorCode.NPC_FUNCTION_NOT_OPEN,
        "old one replaced"
    );
});

test("npc function: check trả config của chức năng đang mở (vd nhóm công thức của crafting)", async () => {
    const { room } = fakeRoom({ x: 10, y: 10 });
    room.npcFunctions.open(PLAYER, {
        npcCode: "blacksmith",
        slotId: "npc_blacksmith",
        functionId: "craft",
        type: NpcFunctionType.CRAFTING,
        config: { recipeGroups: ["smithing"] },
        ...NPC,
    });
    const checked = room.npcFunctions.check(PLAYER, NpcFunctionType.CRAFTING, room.state.players);
    check(checked.success, "open and near");
    checkEqual(
        checked.data,
        { functionId: "craft", config: { recipeGroups: ["smithing"] } },
        "check carries the config the global command needs"
    );
});
