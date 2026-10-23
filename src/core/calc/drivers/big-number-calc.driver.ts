import { BigNumber } from "bignumber.js";
import { CalcInputError } from "@/core/calc/calc.error.js";
import {
    CALC_DECIMAL_PLACES,
    CALC_LATTICE_PLACES,
    type CalcInput,
    type CalcValue,
    type ICalcDriver,
} from "@/core/calc/calc.interface.js";

/** BigNumber riêng của driver: chia tự làm tròn half-up về `CALC_DECIMAL_PLACES`; cộng / trừ / nhân / luỹ thừa không làm tròn. */
const Big = BigNumber.clone({
    DECIMAL_PLACES: CALC_DECIMAL_PLACES,
    ROUNDING_MODE: BigNumber.ROUND_HALF_UP,
});
type Big = BigNumber;

/** Mọi giá trị nằm trên lưới 1e-8 (làm tròn half-up) — cùng độ phân giải với `NativeCalcDriver`, nên hai driver giống hệt nhau. */
const lattice = (value: Big): Big =>
    value.decimalPlaces(CALC_LATTICE_PLACES, BigNumber.ROUND_HALF_UP);

const DECIMAL = /^-?\d+(\.\d+)?$/;

/** Đổi đầu vào bất kỳ thành `Big`; giá trị của driver khác đi qua chuỗi thập phân chuẩn. */
const bigOf = (value: CalcInput): Big => {
    if (value instanceof BigValue) return value.big;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new CalcInputError(`Not a finite number: ${value}`);
        return lattice(new Big(value));
    }
    const text = typeof value === "string" ? value : value.toString();
    if (!DECIMAL.test(text)) throw new CalcInputError(`Not a decimal number: "${text}"`);
    return lattice(new Big(text));
};

export class BigValue implements CalcValue {
    constructor(readonly big: Big) {}

    plus(value: CalcInput): CalcValue {
        return new BigValue(this.big.plus(bigOf(value)));
    }

    minus(value: CalcInput): CalcValue {
        return new BigValue(this.big.minus(bigOf(value)));
    }

    times(value: CalcInput): CalcValue {
        return new BigValue(lattice(this.big.times(bigOf(value))));
    }

    div(value: CalcInput): CalcValue {
        const divisor = bigOf(value);
        if (divisor.isZero()) throw new CalcInputError("Division by zero");
        return new BigValue(this.big.div(divisor));
    }

    pow(exponent: number): CalcValue {
        if (!Number.isInteger(exponent) || exponent < 0) {
            throw new CalcInputError(`Exponent must be an integer >= 0, got ${exponent}`);
        }
        let result: Big = new Big(1);
        for (let step = 0; step < exponent; step++) result = lattice(result.times(this.big));
        return new BigValue(result);
    }

    abs(): CalcValue {
        return new BigValue(this.big.abs());
    }

    negated(): CalcValue {
        return new BigValue(this.big.negated());
    }

    lt(value: CalcInput): boolean {
        return this.big.lt(bigOf(value));
    }

    lte(value: CalcInput): boolean {
        return this.big.lte(bigOf(value));
    }

    gt(value: CalcInput): boolean {
        return this.big.gt(bigOf(value));
    }

    gte(value: CalcInput): boolean {
        return this.big.gte(bigOf(value));
    }

    eq(value: CalcInput): boolean {
        return this.big.eq(bigOf(value));
    }

    isZero(): boolean {
        return this.big.isZero();
    }

    round(): CalcValue {
        return new BigValue(this.big.decimalPlaces(CALC_DECIMAL_PLACES, BigNumber.ROUND_HALF_UP));
    }

    floor(): number {
        return this.big.integerValue(BigNumber.ROUND_FLOOR).toNumber() + 0;
    }

    ceil(): number {
        return this.big.integerValue(BigNumber.ROUND_CEIL).toNumber() + 0;
    }

    roundToInt(): number {
        return this.big.integerValue(BigNumber.ROUND_HALF_UP).toNumber() + 0;
    }

    toNumber(): number {
        return this.big.decimalPlaces(CALC_DECIMAL_PLACES, BigNumber.ROUND_HALF_UP).toNumber() + 0;
    }

    toString(): string {
        return this.big.isZero() ? "0" : this.big.toFixed();
    }
}

/** BigNumber (bignumber.js): thập phân chính xác tuyệt đối, chuẩn tham chiếu của hợp đồng `calc`. Chỉ nạp khi được chọn. */
export class BigNumberCalcDriver implements ICalcDriver {
    readonly name = "big";

    of(value: CalcInput): CalcValue {
        return value instanceof BigValue ? value : new BigValue(bigOf(value));
    }

    min(...values: CalcInput[]): CalcValue {
        if (values.length === 0) throw new CalcInputError("min/max needs at least one value");
        return new BigValue(Big.min(...values.map(bigOf)));
    }

    max(...values: CalcInput[]): CalcValue {
        if (values.length === 0) throw new CalcInputError("min/max needs at least one value");
        return new BigValue(Big.max(...values.map(bigOf)));
    }

    sum(values: readonly CalcInput[]): CalcValue {
        return new BigValue(Big.sum(...values.map(bigOf)));
    }

    clamp(value: CalcInput, min: CalcInput, max: CalcInput): CalcValue {
        return this.min(max, this.max(min, value));
    }
}
