import type { WalletMessage } from "@/rooms/global/modules/wallet/interfaces/wallet.global.message.js";
import { WalletDeltaGlobalService } from "@/rooms/global/modules/wallet/services/wallet-delta.global.service.js";
import { check, checkEqual, test } from "./harness.js";

const balance = (value: number) => ({ balance: value, totalEarned: value, totalSpent: 0 });
const wallet = (gold: number, gem: number): WalletMessage => ({
    gold: balance(gold),
    gem: balance(gem),
});

test("wallet delta: chỉ gửi loại tiền vừa đổi, không đổi thì không gửi", async () => {
    const service = new WalletDeltaGlobalService();
    service.reset("p1", wallet(10, 5));

    checkEqual(service.diff("p1", wallet(10, 5)), null, "ví không đổi");
    checkEqual(service.diff("p1", wallet(25, 5)), { gold: balance(25) }, "chỉ gold đổi");
    checkEqual(
        service.diff("p1", wallet(25, 7)),
        { gem: balance(7) },
        "chỉ gem đổi, so với lần gửi trước"
    );
    checkEqual(
        service.diff("p1", wallet(30, 9)),
        { gold: balance(30), gem: balance(9) },
        "cả hai đổi"
    );
});

test("wallet delta: chưa có mốc thì gửi đủ, reset đặt lại mốc, forget bỏ mốc", async () => {
    const service = new WalletDeltaGlobalService();

    checkEqual(
        service.diff("p1", wallet(1, 2)),
        { gold: balance(1), gem: balance(2) },
        "chưa có mốc"
    );
    service.reset("p1", wallet(8, 8));
    checkEqual(service.diff("p1", wallet(8, 8)), null, "sau reset");
    service.forget("p1");
    check(service.diff("p1", wallet(8, 8)) !== null, "sau forget lại gửi đủ");
    checkEqual(service.diff("p2", wallet(1, 1))?.gold, balance(1), "player khác có mốc riêng");
});
