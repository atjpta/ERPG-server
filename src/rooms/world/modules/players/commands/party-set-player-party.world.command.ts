import { Response } from "@/core/utils/response.util.js";
import type { Result } from "@/core/types/result.type.js";
import type { PartyMembershipEvent } from "@/rooms/global/global.shared.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

/** RPC từ global: thành viên vào / rời party hoặc đổi cách chia loot. Bản cũ / trùng bị bỏ qua. */
export class PartySetPlayerPartyWorldCommand extends Command<WorldRoom, PartyMembershipEvent> {
    result: Result = Response.success();

    execute(event: PartyMembershipEvent) {
        this.room.state.players.get(event.playerId)?.applyPartyEvent(event);
    }
}
