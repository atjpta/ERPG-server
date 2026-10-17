import { EventEmitter } from "node:events";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";

/**
 * Sự kiện nội bộ giữa các world service — để quest (và sau này thứ khác) theo dõi túi đồ mà
 * inventory không phải import ngược lại (tránh vòng phụ thuộc).
 */
const emitter = new EventEmitter();

export const worldEvents = {
    emitInventoryChanged: (client: PlayerClient, player: PlayerWorldState) =>
        emitter.emit("inventoryChanged", client, player),
    onInventoryChanged: (handler: (client: PlayerClient, player: PlayerWorldState) => void) =>
        emitter.on("inventoryChanged", handler),
};
