import { GiftCodes, type NewGiftCodeRow } from "@/modules/gift-codes/entities/gift-code.entity.js";
import { GiftCodeRepo } from "@/modules/gift-codes/repositories/gift-code.repository.js";
import { ItemCode } from "@/modules/items/enums/item-code.enum.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";

/**
 * Gift code mẫu để test (demo Unity, `yarn smoke`). Mỗi code ứng với một tình huống; chạy lại seed chỉ cập nhật định nghĩa,
 * KHÔNG đặt lại `used_count` / `active` và không xoá lượt đã nhập (muốn nhập lại: xoá dòng trong `gift_code_redemptions`).
 */
export const GIFT_CODES: (Omit<NewGiftCodeRow, "reward"> & {
    code: string;
    reward: NewGiftCodeRow["reward"];
})[] = [
    {
        code: "WELCOME",
        note: "Dùng thoải mái: 500 vàng + 5 bình HP nhỏ (mỗi nhân vật 1 lần).",
        reward: {
            exp: 0,
            currency: [{ code: CurrencyCode.GOLD, amount: 500 }],
            items: [{ itemCode: ItemCode.HP_POTION_SMALL, quantity: 5 }],
        },
    },
    {
        code: "GEMS100",
        note: "Chỉ 2 lượt toàn server: nhân vật thứ 3 nhập bị GIFT_CODE_EXHAUSTED.",
        maxUses: 2,
        reward: { exp: 0, currency: [{ code: CurrencyCode.GEM, amount: 100 }], items: [] },
    },
    {
        code: "EXPIRED",
        note: "Đã hết hạn: GIFT_CODE_EXPIRED.",
        expiresAt: new Date("2020-01-01T00:00:00Z"),
        reward: { exp: 0, currency: [{ code: CurrencyCode.GOLD, amount: 1 }], items: [] },
    },
    {
        code: "NOTYET",
        note: "Chưa đến giờ bắt đầu: GIFT_CODE_NOT_STARTED.",
        startsAt: new Date("2099-01-01T00:00:00Z"),
        reward: { exp: 0, currency: [{ code: CurrencyCode.GOLD, amount: 1 }], items: [] },
    },
    {
        code: "DISABLED",
        note: "Đang tắt: GIFT_CODE_NOT_FOUND (bật bằng `yarn mail:tool giftcode enable DISABLED`).",
        active: false,
        reward: { exp: 0, currency: [{ code: CurrencyCode.GOLD, amount: 1 }], items: [] },
    },
];

export const GiftCodeSeed = async () => {
    for (const giftCode of GIFT_CODES) {
        const { active: _active, ...definition } = giftCode;
        await GiftCodeRepo.upsert({
            data: giftCode,
            target: GiftCodes.code,
            matchValue: giftCode.code,
            updateData: definition, // không đụng `usedCount` và `active`
        });
    }
    console.info("✅ [GiftCodeSeed] Done");
};
