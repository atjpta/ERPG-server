export interface CurrencyBalanceMessage {
    balance: number;
    totalEarned: number;
    totalSpent: number;
}

/** Ví theo CurrencyCode. */
export interface WalletMessage {
    gold: CurrencyBalanceMessage;
    gem: CurrencyBalanceMessage;
}

/** Chi tiết ví đổi (push `wallet`): chỉ có loại tiền vừa đổi, loại không có thì client giữ số cũ. */
export interface WalletChangedMessage {
    gold?: CurrencyBalanceMessage;
    gem?: CurrencyBalanceMessage;
}
