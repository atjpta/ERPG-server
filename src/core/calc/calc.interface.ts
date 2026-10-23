/**
 * Hợp đồng tính toán thập phân dùng chung cho mọi driver (`NativeCalcDriver`, `BigNumberCalcDriver`). Hai driver phải cho
 * kết quả GIỐNG HỆT nhau trên cùng dữ liệu (xem bộ test conformance `scripts/tests/calc.test.ts`); BigNumber là chuẩn tham chiếu.
 *
 * | Phép                     | Ngữ nghĩa                                                                                        |
 * | ------------------------ | ------------------------------------------------------------------------------------------------ |
 * | `of(x)`                  | số hữu hạn / chuỗi `^-?\d+(\.\d+)?$` (dấu chấm) / `CalcValue`, làm tròn về lưới 1e-8; còn lại ném `CalcInputError` |
 * | `plus` `minus`           | cộng / trừ chính xác (hai vế đã nằm trên lưới 1e-8)                                              |
 * | `times` `pow`            | nhân chính xác rồi làm tròn half-up (ra xa số 0) về lưới 1e-8 (`CALC_LATTICE_PLACES`)             |
 * | `div`                    | làm tròn half-up về `CALC_DECIMAL_PLACES` (4); chia cho 0 ném `CalcInputError`                    |
 * | `pow(n)`                 | n nguyên ≥ 0, n lần `times`                                                                      |
 * | `round()`                | half-up (hoà thì ra xa số 0, cả số âm) về 4 chữ số thập phân                                     |
 * | `floor()` `ceil()`       | số nguyên chính xác trên giá trị thập phân (không có `110.00000000000001 → ceil 111`)             |
 * | `roundToInt()`           | half-up (ra xa số 0) về số nguyên                                                                |
 * | `lt` `lte` `gt` `gte` `eq` | so sánh giá trị thập phân                                                                      |
 * | `toNumber()`             | số JS của giá trị đã `round()` (4 chữ số) — dùng khi lưu / gửi client                             |
 * | `toString()`             | chuỗi thập phân dấu chấm, không dạng mũ (`1e-8` → `0.00000001`)                                  |
 */

/** Số chữ số thập phân tối đa của mọi phép tính chỉ số / damage (làm tròn half-up). */
export const CALC_DECIMAL_PLACES = 4;

/**
 * Độ phân giải của mọi giá trị `calc`: số thập phân nằm trên lưới 1e-8 (mọi đầu vào, tích, luỹ thừa được làm tròn half-up về 8 chữ số).
 * Nhờ vậy Native (số nguyên các ô 1e-8) và BigNumber cho kết quả GIỐNG HỆT nhau với mọi đầu vào, không có sai số float nào.
 */
export const CALC_LATTICE_PLACES = 8;

/** Đầu vào của phép tính: số JS, chuỗi thập phân dấu chấm, hoặc giá trị của bất kỳ driver nào. */
export type CalcInput = number | string | CalcValue;

/** Một số thập phân bất biến. Mọi phép trả giá trị mới, không sửa giá trị cũ. */
export interface CalcValue {
    plus(value: CalcInput): CalcValue;
    minus(value: CalcInput): CalcValue;
    times(value: CalcInput): CalcValue;
    div(value: CalcInput): CalcValue;
    /** Số mũ nguyên ≥ 0. */
    pow(exponent: number): CalcValue;
    abs(): CalcValue;
    negated(): CalcValue;
    lt(value: CalcInput): boolean;
    lte(value: CalcInput): boolean;
    gt(value: CalcInput): boolean;
    gte(value: CalcInput): boolean;
    eq(value: CalcInput): boolean;
    isZero(): boolean;
    /** Làm tròn half-up về `CALC_DECIMAL_PLACES` chữ số thập phân. */
    round(): CalcValue;
    /** Làm tròn xuống thành số nguyên. */
    floor(): number;
    /** Làm tròn lên thành số nguyên. */
    ceil(): number;
    /** Làm tròn half-up (ra xa số 0) thành số nguyên. */
    roundToInt(): number;
    /** `round()` rồi đổi ra `number`. */
    toNumber(): number;
    /** Chuỗi thập phân dấu chấm, không dạng mũ. */
    toString(): string;
}

/** Cách tạo và kết hợp giá trị; mỗi driver có kiểu `CalcValue` riêng nhưng nhận giá trị của driver khác qua `toString()`. */
export interface ICalcDriver {
    readonly name: string;
    of(value: CalcInput): CalcValue;
    min(...values: CalcInput[]): CalcValue;
    max(...values: CalcInput[]): CalcValue;
    sum(values: readonly CalcInput[]): CalcValue;
    /** Kẹp `value` trong [min, max]. */
    clamp(value: CalcInput, min: CalcInput, max: CalcInput): CalcValue;
}
