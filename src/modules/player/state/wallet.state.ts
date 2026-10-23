import type { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import type { Wallet } from "@/modules/player/schemas/wallet.schema.js";
import type { CurrencyReward } from "@/modules/rewards/types/reward.type.js";

/**
 * Ví của một player: bọc đối tượng `Wallet` đã lưu (cột `wallet`, không đổi dạng lưu) và sửa thẳng trên nó.
 * Chỉ đổi dữ liệu; lưu / báo client là việc của owner (`PlayerStateManager`).
 */
export class WalletState {
    constructor(readonly balances: Wallet) {}

    balanceOf(code: CurrencyCode): number {
        return this.balances[code]?.balance ?? 0;
    }

    /** Đủ tiền trả `costs` không (không đổi ví). */
    canAfford(costs: readonly CurrencyReward[]): boolean {
        return costs.every(({ code, amount }) => amount <= 0 || this.balanceOf(code) >= amount);
    }

    /** Cộng tiền (balance + amount, totalEarned + amount); bỏ qua số ≤ 0. */
    credit(rewards: readonly CurrencyReward[]): void {
        for (const { code, amount } of rewards) {
            if (amount <= 0) continue;
            const balance = (this.balances[code] ??= { balance: 0, totalEarned: 0, totalSpent: 0 });
            balance.balance += amount;
            balance.totalEarned += amount;
        }
    }

    /** Trừ tiền (balance − amount, totalSpent + amount); không đủ thì `false` và không đổi gì. */
    debit(costs: readonly CurrencyReward[]): boolean {
        if (!this.canAfford(costs)) return false;
        for (const { code, amount } of costs) {
            if (amount <= 0) continue;
            const balance = this.balances[code];
            balance.balance -= amount;
            balance.totalSpent += amount;
        }
        return true;
    }
}
