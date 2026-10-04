import { BigNumber } from "bignumber.js";

/** Số chữ số thập phân tối đa của mọi phép tính stat/damage (làm tròn half-up). */
export const BIG_DECIMAL_PLACES = 4;

/**
 * BigNumber dùng chung cho mọi phép tính chỉ số/damage — tránh sai số float (0.1 + 0.2 ≠ 0.3) và
 * cho kết quả tất định để client (C# `decimal`) tính ra cùng số. Phép chia tự làm tròn về
 * `BIG_DECIMAL_PLACES`; nhân/cộng không tự làm tròn nên kết quả mỗi bước phải qua `roundBig`.
 */
export const Big = BigNumber.clone({
    DECIMAL_PLACES: BIG_DECIMAL_PLACES,
    ROUNDING_MODE: BigNumber.ROUND_HALF_UP,
});

export type Big = BigNumber;

export const big = (value: BigNumber.Value): Big => new Big(value);

/** Làm tròn về tối đa `BIG_DECIMAL_PLACES` chữ số thập phân. */
export const roundBig = (value: Big): Big =>
    value.decimalPlaces(BIG_DECIMAL_PLACES, BigNumber.ROUND_HALF_UP);

/** `roundBig` rồi đổi ra `number` — dùng khi lưu kết quả (stats...). */
export const bigToNumber = (value: Big): number => roundBig(value).toNumber();

export const clampBig = (value: Big, min: BigNumber.Value, max: BigNumber.Value): Big =>
    Big.min(max, Big.max(min, value));

/** Làm tròn xuống thành số nguyên (`number`) — dùng ở bước cuối (HP, damage...). */
export const floorBig = (value: Big): number =>
    value.integerValue(BigNumber.ROUND_FLOOR).toNumber();
