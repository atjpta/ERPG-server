import { z } from "zod";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";

export const CurrencyBalanceSchema = z.object({
    balance: z.number().int().nonnegative(),
    totalEarned: z.number().int().nonnegative(),
    totalSpent: z.number().int().nonnegative(),
});

export type CurrencyBalance = z.infer<typeof CurrencyBalanceSchema>;

/** Cột `wallet` của player state: mỗi loại tiền một số dư + tổng đã nhận / đã tiêu. */
export const WalletSchema = z.record(z.enum(CurrencyCode), CurrencyBalanceSchema);

export type Wallet = Record<CurrencyCode, CurrencyBalance>;

export const createWallet = (): Wallet =>
    Object.fromEntries(
        Object.values(CurrencyCode).map((code) => [
            code,
            { balance: 0, totalEarned: 0, totalSpent: 0 },
        ])
    ) as Wallet;
