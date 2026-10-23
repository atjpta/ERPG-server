import { CalcInputError } from "@/core/calc/calc.error.js";
import type { CalcInput, CalcValue, ICalcDriver } from "@/core/calc/calc.interface.js";

/**
 * Giá trị = số nguyên các ô 1e-8 (lưới `CALC_LATTICE_PLACES`). Không có số thực nào trong phép tính:
 * - đủ nhỏ (|ô| ≤ 2^53) → dùng `number` nguyên (nhanh);
 * - lớn hơn → tự chuyển sang `bigint` (vẫn chính xác, không giới hạn độ lớn).
 */
type Units = number | bigint;

const GRID = 100_000_000;
const STEP = 10_000;
const GRID_BIG = 100_000_000n;
const STEP_BIG = 10_000n;
const MAX_SAFE_BIG = BigInt(Number.MAX_SAFE_INTEGER);

const DECIMAL = /^-?\d+(\.\d+)?$/;
const PARTS = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i;

const bigOf = (units: Units): bigint => (typeof units === "bigint" ? units : BigInt(units));

/** `bigint` → `number` nếu vừa trong khoảng nguyên an toàn, ngược lại giữ `bigint`. */
const fit = (units: bigint): Units =>
    units <= MAX_SAFE_BIG && units >= -MAX_SAFE_BIG ? Number(units) : units;

/** floor(a / b) cho số nguyên `a` và b > 0, chính xác (không phụ thuộc sai số chia float). */
const floorDiv = (a: number, b: number): number => {
    let quotient = Math.trunc(a / b);
    let remainder = a - quotient * b;
    while (remainder < 0) {
        quotient--;
        remainder += b;
    }
    while (remainder >= b) {
        quotient++;
        remainder -= b;
    }
    return quotient;
};

const floorDivBig = (a: bigint, b: bigint): bigint => {
    const quotient = a / b;
    return a % b !== 0n && a < 0n !== b < 0n ? quotient - 1n : quotient;
};

/** Làm tròn half-up (ra xa số 0) `units` ô về bội của `unit` ô; trả số bội. */
const roundTo = (units: Units, unit: number): Units => {
    if (typeof units === "number") {
        return (units < 0 ? -1 : 1) * floorDiv(Math.abs(units) + unit / 2, unit);
    }
    const divisor = BigInt(unit);
    const absolute = units < 0n ? -units : units;
    const rounded = (2n * absolute + divisor) / (2n * divisor);
    return fit(units < 0n ? -rounded : rounded);
};

/** Chuỗi thập phân (có thể có mũ, từ `String(number)`) → ô 1e-8, làm tròn half-up (ra xa số 0), chính xác bằng BigInt. */
const parseUnits = (text: string): Units => {
    const match = PARTS.exec(text);
    if (!match) throw new CalcInputError(`Not a decimal number: "${text}"`);
    const [, sign, whole, fraction = "", exponent = "0"] = match;
    const digits = BigInt(whole + fraction);
    const shift = Number(exponent) - fraction.length + 8;
    let units: bigint;
    if (shift >= 0) {
        units = digits * 10n ** BigInt(shift);
    } else {
        const divisor = 10n ** BigInt(-shift);
        units = (2n * digits + divisor) / (2n * divisor);
    }
    return fit(sign === "-" ? -units : units);
};

/** Đầu vào bất kỳ → ô 1e-8. */
const unitsOf = (value: CalcInput): Units => {
    if (value instanceof NativeValue) return value.units;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new CalcInputError(`Not a finite number: ${value}`);
        if (Number.isInteger(value) && Math.abs(value) < 9e6) return value * GRID + 0;
        if (Math.abs(value) < 1000) {
            // Đường nhanh: nếu value × 1e8 rõ ràng gần một số nguyên (không gần ô hoà .5) thì làm tròn thẳng là đúng.
            const scaled = value * GRID;
            const rounded = Math.round(scaled);
            if (Math.abs(scaled - rounded) < 1e-3) return rounded + 0;
        }
        return parseUnits(String(value));
    }
    const text = typeof value === "string" ? value : value.toString();
    if (!DECIMAL.test(text)) throw new CalcInputError(`Not a decimal number: "${text}"`);
    return parseUnits(text);
};

const compare = (a: Units, b: Units): number => {
    if (typeof a === "number" && typeof b === "number") return a < b ? -1 : a > b ? 1 : 0;
    const left = bigOf(a);
    const right = bigOf(b);
    return left < right ? -1 : left > right ? 1 : 0;
};

/** Số thập phân bất biến lưu bằng số nguyên các ô 1e-8: mọi phép đều chính xác, kết quả giống hệt `BigNumberCalcDriver`. */
export class NativeValue implements CalcValue {
    constructor(readonly units: Units) {}

    plus(value: CalcInput): CalcValue {
        const other = unitsOf(value);
        if (typeof this.units === "number" && typeof other === "number") {
            const sum = this.units + other;
            if (Number.isSafeInteger(sum)) return new NativeValue(sum + 0);
        }
        return new NativeValue(fit(bigOf(this.units) + bigOf(other)));
    }

    minus(value: CalcInput): CalcValue {
        const other = unitsOf(value);
        if (typeof this.units === "number" && typeof other === "number") {
            const difference = this.units - other;
            if (Number.isSafeInteger(difference)) return new NativeValue(difference + 0);
        }
        return new NativeValue(fit(bigOf(this.units) - bigOf(other)));
    }

    /** Nhân rồi làm tròn half-up (ra xa số 0) về lưới 1e-8; tích vượt 2^52 thì tính bằng BigInt. */
    times(value: CalcInput): CalcValue {
        const other = unitsOf(value);
        if (typeof this.units === "number" && typeof other === "number") {
            const product = this.units * other;
            if (Math.abs(product) < 2 ** 52) {
                return new NativeValue(roundTo(product, GRID) as number);
            }
        }
        const exact = bigOf(this.units) * bigOf(other);
        const absolute = exact < 0n ? -exact : exact;
        const rounded = (2n * absolute + GRID_BIG) / (2n * GRID_BIG);
        return new NativeValue(fit(exact < 0n ? -rounded : rounded));
    }

    /** Chia chính xác bằng BigInt, làm tròn half-up (ra xa số 0) về 4 chữ số. */
    div(value: CalcInput): CalcValue {
        const numerator = bigOf(this.units);
        const divisor = bigOf(unitsOf(value));
        if (divisor === 0n) throw new CalcInputError("Division by zero");
        const negative = numerator < 0n !== divisor < 0n;
        const top = (numerator < 0n ? -numerator : numerator) * STEP_BIG;
        const bottom = divisor < 0n ? -divisor : divisor;
        const steps = (2n * top + bottom) / (2n * bottom);
        return new NativeValue(fit((negative ? -steps : steps) * STEP_BIG));
    }

    pow(exponent: number): CalcValue {
        if (!Number.isInteger(exponent) || exponent < 0) {
            throw new CalcInputError(`Exponent must be an integer >= 0, got ${exponent}`);
        }
        let result: CalcValue = new NativeValue(GRID);
        for (let step = 0; step < exponent; step++) result = result.times(this);
        return result;
    }

    abs(): CalcValue {
        return typeof this.units === "number"
            ? new NativeValue(Math.abs(this.units))
            : new NativeValue(this.units < 0n ? -this.units : this.units);
    }

    negated(): CalcValue {
        return typeof this.units === "number"
            ? new NativeValue(-this.units + 0)
            : new NativeValue(fit(-this.units));
    }

    lt(value: CalcInput): boolean {
        return compare(this.units, unitsOf(value)) < 0;
    }

    lte(value: CalcInput): boolean {
        return compare(this.units, unitsOf(value)) <= 0;
    }

    gt(value: CalcInput): boolean {
        return compare(this.units, unitsOf(value)) > 0;
    }

    gte(value: CalcInput): boolean {
        return compare(this.units, unitsOf(value)) >= 0;
    }

    eq(value: CalcInput): boolean {
        return compare(this.units, unitsOf(value)) === 0;
    }

    isZero(): boolean {
        return this.units === 0 || this.units === 0n;
    }

    round(): CalcValue {
        const steps = roundTo(this.units, STEP);
        return new NativeValue(
            typeof steps === "number" && Number.isSafeInteger(steps * STEP)
                ? steps * STEP
                : fit(bigOf(steps) * STEP_BIG)
        );
    }

    floor(): number {
        return typeof this.units === "number"
            ? floorDiv(this.units, GRID) + 0
            : Number(floorDivBig(this.units, GRID_BIG));
    }

    ceil(): number {
        return typeof this.units === "number"
            ? -floorDiv(-this.units, GRID) + 0
            : -Number(floorDivBig(-this.units, GRID_BIG));
    }

    roundToInt(): number {
        return Number(roundTo(this.units, GRID)) + 0;
    }

    toNumber(): number {
        // 4 chữ số: `steps` là số nguyên, chia 1e4 cho số JS gần nhất của giá trị thập phân.
        return Number(roundTo(this.units, STEP)) / STEP + 0;
    }

    toString(): string {
        const units = bigOf(this.units);
        const sign = units < 0n ? "-" : "";
        const absolute = units < 0n ? -units : units;
        const whole = absolute / GRID_BIG;
        const fraction = String(absolute % GRID_BIG)
            .padStart(8, "0")
            .replace(/0+$/, "");
        return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
    }
}

/** Số nguyên các ô 1e-8 (không dùng số thực): nhẹ, không nạp thư viện nào, không giới hạn độ lớn. Mặc định của `calcService`. */
export class NativeCalcDriver implements ICalcDriver {
    readonly name = "native";

    of(value: CalcInput): CalcValue {
        return value instanceof NativeValue ? value : new NativeValue(unitsOf(value));
    }

    min(...values: CalcInput[]): CalcValue {
        return this.pick(values, (candidate, best) => compare(candidate, best) < 0);
    }

    max(...values: CalcInput[]): CalcValue {
        return this.pick(values, (candidate, best) => compare(candidate, best) > 0);
    }

    sum(values: readonly CalcInput[]): CalcValue {
        let total: CalcValue = new NativeValue(0);
        for (const value of values) total = total.plus(value);
        return total;
    }

    clamp(value: CalcInput, min: CalcInput, max: CalcInput): CalcValue {
        return this.min(max, this.max(min, value));
    }

    private pick(
        values: readonly CalcInput[],
        better: (candidate: Units, best: Units) => boolean
    ): CalcValue {
        if (values.length === 0) throw new CalcInputError("min/max needs at least one value");
        let best = unitsOf(values[0]);
        for (let index = 1; index < values.length; index++) {
            const candidate = unitsOf(values[index]);
            if (better(candidate, best)) best = candidate;
        }
        return new NativeValue(best);
    }
}
