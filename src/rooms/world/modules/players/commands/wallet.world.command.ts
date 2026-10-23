import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import type { Wallet } from "@/modules/player/schemas/wallet.schema.js";
import { playerService } from "@/modules/player/services/player.service.js";
import type { WalletChange } from "@/rooms/global/global.shared.js";
import type { WalletMessage } from "@/rooms/world/modules/rewards/interfaces/reward.world.message.js";
import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

/** Số eventId gần nhất nhớ để không trừ / hoàn ví hai lần khi global gửi lại. */
const MAX_WALLET_EVENTS = 256;
const seenEvents: string[] = [];

/** Chạy `change` một lần cho mỗi `eventId`; lần lặp trả ví hiện tại, không đổi gì. */
function applyWalletChange(
    room: WorldRoom,
    { eventId, playerId, currencies }: WalletChange,
    change: (wallet: Wallet) => Wallet | undefined
): Result<{ wallet: Wallet }> {
    const player = room.state.players.get(playerId);
    if (!player) return Response.error(CommonCode.ROOM_UNAVAILABLE);
    if (seenEvents.includes(eventId) || currencies.length === 0) {
        return Response.success({ wallet: structuredClone(player.wallet) });
    }
    const next = change(player.wallet);
    if (!next) return Response.error(ItemErrorCode.CURRENCY_NOT_ENOUGH);
    player.wallet = next;
    seenEvents.push(eventId);
    if (seenEvents.length > MAX_WALLET_EVENTS) seenEvents.shift();
    const message: WalletMessage = player.wallet;
    room.clientOf(playerId)?.sendSuccess(WorldMessage.WALLET, message);
    return Response.success({ wallet: structuredClone(player.wallet) });
}

/** RPC từ global: trừ ví của player (cường hoá / tinh hoá tốn vàng) — nguyên tử, idempotent theo `eventId`. */
export class DebitWalletWorldCommand extends Command<WorldRoom, WalletChange> {
    result: Result<{ wallet: Wallet }> = Response.error(CommonCode.ROOM_UNAVAILABLE);

    execute(change: WalletChange) {
        this.result = applyWalletChange(this.room, change, (wallet) =>
            playerService.debitWallet(wallet, change.currencies)
        );
    }
}

/** RPC từ global: hoàn ví khi bước sau của giao dịch thất bại. */
export class CreditWalletWorldCommand extends Command<WorldRoom, WalletChange> {
    result: Result<{ wallet: Wallet }> = Response.error(CommonCode.ROOM_UNAVAILABLE);

    execute(change: WalletChange) {
        this.result = applyWalletChange(this.room, change, (wallet) =>
            playerService.creditWallet(wallet, change.currencies)
        );
    }
}
