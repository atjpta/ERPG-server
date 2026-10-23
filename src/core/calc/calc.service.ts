import { CalcInputError } from "@/core/calc/calc.error.js";
import type { CalcInput, CalcValue, ICalcDriver } from "@/core/calc/calc.interface.js";
import { BigNumberCalcDriver } from "@/core/calc/drivers/big-number-calc.driver.js";
import { NativeCalcDriver } from "@/core/calc/drivers/native-calc.driver.js";

export type CalcDriverName = "native" | "big";

const resolveDriver = (driver: ICalcDriver | CalcDriverName): ICalcDriver => {
    if (typeof driver !== "string") return driver;
    switch (driver) {
        case "native":
            return new NativeCalcDriver();
        case "big":
            return new BigNumberCalcDriver();
        default:
            throw new CalcInputError(`Unknown calc driver: ${String(driver)}`);
    }
};

/**
 * Điểm vào duy nhất cho phép tính thập phân (damage, chỉ số, reward, equipment...); code nghiệp vụ không dùng driver trực tiếp.
 * - `calc` (bản dùng chung): mặc định driver `native` (nhẹ), đổi bất cứ lúc nào bằng `calc.use("big")` / `calc.use(driver)`.
 * - Chỗ luôn cần BigNumber (chi phí nâng cấp, thưởng, chỉ số): mỗi lần tính tạo một bản riêng `const calc = new CalcService("big")`,
 *   không bị ảnh hưởng bởi `calc.use` của bản dùng chung.
 * Giá trị tạo bởi driver này dùng được với driver kia (đi qua chuỗi thập phân chuẩn), mỗi phép tính chạy đồng bộ nên đổi giữa chừng an toàn.
 */
export class CalcService implements ICalcDriver {
    private driver: ICalcDriver;

    constructor(driver: ICalcDriver | CalcDriverName = "native") {
        this.driver = resolveDriver(driver);
    }

    get name(): string {
        return this.driver.name;
    }

    /** Chọn driver (instance hoặc tên `"native"` | `"big"`); gọi được bất cứ lúc nào. */
    use(driver: ICalcDriver | CalcDriverName): void {
        this.driver = resolveDriver(driver);
    }

    of(value: CalcInput): CalcValue {
        return this.driver.of(value);
    }

    min(...values: CalcInput[]): CalcValue {
        return this.driver.min(...values);
    }

    max(...values: CalcInput[]): CalcValue {
        return this.driver.max(...values);
    }

    sum(values: readonly CalcInput[]): CalcValue {
        return this.driver.sum(values);
    }

    clamp(value: CalcInput, min: CalcInput, max: CalcInput): CalcValue {
        return this.driver.clamp(value, min, max);
    }
}

/** Bản dùng chung của process (mặc định `native`): `calc.of(x).times(y).round()`. */
export const calcService = new CalcService();
export const calc = calcService;
