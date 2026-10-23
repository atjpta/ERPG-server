import { Schema } from "@colyseus/schema";
import { PartiesState } from "@/rooms/global/modules/party/schemas/parties.global.state.js";
import type { PlayerDataState } from "@/rooms/global/modules/player-data/schemas/player-data.global.state.js";

/**
 * State của global room — nằm trong bộ nhớ server, KHÔNG đồng bộ cho client: không field nào khai báo `@type`, nên
 * Colyseus không mã hoá và không gửi gì xuống. Mỗi phần là một Schema kèm hàm xử lý của nó; client nhận dữ liệu của
 * global bằng message (`partyState`...).
 */
export class GlobalState extends Schema {
    readonly players = new Map<string, PlayerDataState>();
    /** Mọi party của game server. */
    readonly parties = new PartiesState();
}
