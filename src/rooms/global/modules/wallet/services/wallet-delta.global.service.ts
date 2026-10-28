import type {
    WalletChangedMessage,
    WalletMessage,
} from "@/rooms/global/modules/wallet/interfaces/wallet.global.message.js";

const CURRENCIES = ["gold", "gem"] as const;

type SentWallet = Record<(typeof CURRENCIES)[number], string>;

/**
 * Tính **chi tiết thay đổi** của ví giữa hai lần gửi để client chỉ nhận loại tiền vừa đổi (push `wallet`) thay vì cả ví. Mỗi player một
 * bản "đã gửi", đặt lúc vào room và mỗi khi client xin snapshot (`getWallet`); mọi nơi đổi ví (global hay world) không cần biết gì về việc này.
 */
export class WalletDeltaGlobalService {
    private readonly sent = new Map<string, SentWallet>();

    /** Client vừa nhận (hoặc sắp nhận) snapshot ví hiện tại: delta về sau tính từ mốc này. */
    reset(playerId: string, wallet: WalletMessage): void {
        this.sent.set(playerId, this.capture(wallet));
    }

    forget(playerId: string): void {
        this.sent.delete(playerId);
    }

    /** Loại tiền khác lần gửi trước (và coi như đã gửi); `null` nếu ví không đổi. Chưa có mốc thì gửi đủ. */
    diff(playerId: string, wallet: WalletMessage): WalletChangedMessage | null {
        const before = this.sent.get(playerId);
        const now = this.capture(wallet);
        this.sent.set(playerId, now);

        const changed: WalletChangedMessage = {};
        for (const code of CURRENCIES) {
            if (before?.[code] !== now[code]) changed[code] = { ...wallet[code] };
        }
        return Object.keys(changed).length > 0 ? changed : null;
    }

    private capture(wallet: WalletMessage): SentWallet {
        return { gold: JSON.stringify(wallet.gold), gem: JSON.stringify(wallet.gem) };
    }
}

export const walletDeltaGlobalService = new WalletDeltaGlobalService();
