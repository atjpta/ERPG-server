import { Response } from "@/core/response/response.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import type { WalletMessage } from "@/rooms/world/modules/rewards/interfaces/reward.world.message.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import { PlayerWorldCommand } from "@/rooms/world/player.world.command.js";

@SdkMessage({
    response: "WalletMessage",
    note: "Gọi lúc vào room; sau đó cập nhật theo push `wallet`.",
})
export class GetWalletWorldCommand extends PlayerWorldCommand {
    static readonly message = WorldClientMessage.GET_WALLET;

    execute() {
        this.result = Response.success<WalletMessage>(this.player.wallet);
    }
}
