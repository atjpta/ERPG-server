import { Response } from "@/core/response/response.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import type { WalletMessage } from "@/rooms/global/modules/wallet/interfaces/wallet.global.message.js";
import { walletDeltaGlobalService } from "@/rooms/global/modules/wallet/services/wallet-delta.global.service.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    response: "WalletMessage",
    note: "Gọi lúc vào game; sau đó cập nhật theo push `wallet`.",
})
export class GetWalletGlobalCommand extends PlayerGlobalCommand {
    static readonly message = GlobalClientMessage.GET_WALLET;

    /** Ví hiện tại; push `wallet` về sau chỉ gửi loại tiền khác snapshot này. */
    execute() {
        walletDeltaGlobalService.reset(this.player.playerId, this.player.data.wallet);
        this.result = Response.success<WalletMessage>(this.player.data.wallet);
    }
}
