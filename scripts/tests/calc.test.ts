import { CalcInputError } from "@/core/calc/calc.error.js";
import type { CalcInput, CalcValue, ICalcDriver } from "@/core/calc/calc.interface.js";
import { CalcService, calcService } from "@/core/calc/calc.service.js";
import { check, checkEqual, test } from "./harness.js";

const native = new CalcService("native");
const big = new CalcService("big");
const drivers: ICalcDriver[] = [native, big];

const throwsOf = (fn: () => unknown): unknown => {
    try {
        fn();
    } catch (error) {
        return error;
    }
    return undefined;
};

/** Kết quả quan sát của một giá trị — mọi thứ client / DB có thể thấy. */
const observe = (value: CalcValue) => ({
    round: value.round().toString(),
    number: value.toNumber(),
    floor: value.floor(),
    ceil: value.ceil(),
    int: value.roundToInt(),
});

/** Chạy cùng một hàm trên từng driver; mọi driver phải cho kết quả giống hệt nhau, trả về kết quả chung. */
const same = <T>(label: string, fn: (driver: ICalcDriver) => T): T => {
    const [first, second] = drivers.map(fn);
    checkEqual(first, second, `${label}: native vs big`);
    return first;
};

test("calc: ca vàng giống nhau ở cả hai driver", async () => {
    checkEqual(
        same("0.1 + 0.2", (d) => observe(d.of(0.1).plus(0.2))),
        { round: "0.3", number: 0.3, floor: 0, ceil: 1, int: 0 },
        "0.1 + 0.2"
    );
    check(
        same("0.1 + 0.2 eq 0.3", (d) => d.of(0.1).plus(0.2).eq(0.3)),
        "0.1 + 0.2 equals 0.3"
    );
    checkEqual(
        same("ceil(100 x 1.1)", (d) => d.of(100).times(1.1).ceil()),
        110,
        "ceil(100 x 1.1) is 110, not 111"
    );
    checkEqual(
        same("floor(100 x 1.1)", (d) => d.of(100).times(1.1).floor()),
        110,
        "floor(100 x 1.1)"
    );
    checkEqual(
        same("half-up", (d) => [
            d.of("1.00005").round().toString(),
            d.of("-1.00005").round().toString(),
            d.of("0.00005").round().toString(),
            d.of("-0.00005").round().toString(),
            d.of("0.00004").round().toString(),
            d.of("-0.00004").round().toString(),
        ]),
        ["1.0001", "-1.0001", "0.0001", "-0.0001", "0", "0"],
        "half-up rounds ties away from zero, -0 is 0"
    );
    checkEqual(
        same("div", (d) => [
            d.of(1).div(3).toString(),
            d.of(2).div(3).toString(),
            d.of(1).div(20000).toString(),
            d.of(-1).div(3).toString(),
            d.of(10).div(4).toString(),
        ]),
        ["0.3333", "0.6667", "0.0001", "-0.3333", "2.5"],
        "div rounds half-up to 4 places"
    );
    checkEqual(
        same("tiny", (d) => [
            d.of(0.0001).times(0.0001).isZero(),
            d.of(0.0001).times(0.0001).gt(0),
            d.of(0.0001).times(0.0001).eq("0.00000001"),
            d.of(0.0001).times(0.0001).round().toString(),
        ]),
        [false, true, true, "0"],
        "product of two 4-place numbers"
    );
    checkEqual(
        same("pow", (d) => observe(d.of(1.25).pow(10).times(100))),
        { round: "931.3226", number: 931.3226, floor: 931, ceil: 932, int: 931 },
        "1.25^10 x 100"
    );
    checkEqual(
        same("pow 0", (d) => d.of(7).pow(0).toString()),
        "1",
        "x^0 is 1"
    );
    checkEqual(
        same("min/max/sum/clamp", (d) => [
            d.min(3, 1.5, 2).toString(),
            d.max(3, 1.5, 2).toString(),
            d.sum([0.1, 0.2, 0.3]).toString(),
            d.sum([]).toString(),
            d.clamp(5, 0, 3).toString(),
            d.clamp(-5, 0, 3).toString(),
            d.clamp(1.5, 0, 3).toString(),
        ]),
        ["1.5", "3", "0.6", "0", "3", "0", "1.5"],
        "min/max/sum/clamp"
    );
    checkEqual(
        same("compare", (d) => [
            d.of(1).lt(2),
            d.of(2).lte(2),
            d.of(2).gt(2),
            d.of(2).gte(2),
            d.of(1.0001).gt(1),
            d.of(-1).abs().eq(1),
            d.of(3).negated().toString(),
        ]),
        [true, true, false, true, true, true, "-3"],
        "comparisons"
    );
    checkEqual(
        same("toString has no exponent", (d) => [
            d.of(0.00000001).toString(),
            d.of(123456.5).toString(),
            d.of(-0.25).toString(),
        ]),
        ["0.00000001", "123456.5", "-0.25"],
        "plain decimal strings"
    );
});

test("calc: đầu vào sai ném lỗi rõ ràng, không lan NaN (dấu . và ,)", async () => {
    for (const driver of drivers) {
        const label = driver.name;
        checkEqual(driver.of("1.5").toNumber(), 1.5, `${label}: dot decimal`);
        checkEqual(driver.of(1.5).toNumber(), 1.5, `${label}: number`);
        for (const bad of ["1,5", "", " 1.5", "1.5 ", "1e3", "abc", "1.", ".5", "--1"]) {
            check(
                throwsOf(() => driver.of(bad)) instanceof CalcInputError,
                `${label}: of(${JSON.stringify(bad)}) must throw`
            );
        }
        for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
            check(
                throwsOf(() => driver.of(bad)) instanceof CalcInputError,
                `${label}: of(${bad}) must throw`
            );
            check(
                throwsOf(() => driver.of(1).plus(bad)) instanceof CalcInputError,
                `${label}: plus(${bad}) must throw`
            );
        }
        check(
            throwsOf(() => driver.of(1).times("1,5")) instanceof CalcInputError,
            `${label}: times("1,5") must throw`
        );
        check(
            throwsOf(() => driver.of(1).div(0)) instanceof CalcInputError,
            `${label}: division by zero must throw`
        );
        for (const exponent of [0.5, -1, Number.NaN]) {
            check(
                throwsOf(() => driver.of(2).pow(exponent)) instanceof CalcInputError,
                `${label}: pow(${exponent}) must throw`
            );
        }
        check(
            throwsOf(() => driver.min()) instanceof CalcInputError,
            `${label}: min() without values must throw`
        );
    }
});

test("calc: Native không giới hạn độ lớn (tự chuyển sang bigint, vẫn chính xác)", async () => {
    checkEqual(
        same("huge", (d) => [
            d.of(1e12).times(1e12).toString(),
            d.of("123456789012345678.12345678").plus("0.00000002").toString(),
            d.of(1e15).times(1e15).div(7).toString(),
            d.of(1e8).round().toString(),
            d.of(1e15).times(1e15).floor() === d.of(1e15).times(1e15).ceil(),
        ]),
        [
            "1000000000000000000000000",
            "123456789012345678.1234568",
            "142857142857142857142857142857.1429",
            "100000000",
            true,
        ],
        "values beyond 2^53 units stay exact in both drivers"
    );
});

test("calc: lưới hoà half-up — (2k+1) x 0.00005 cho k = -20000…20000", async () => {
    // Đầu vào là số nguyên ở đơn vị 1e-5 nên chuỗi thập phân là chính xác.
    const format = (value: number, places: number) => {
        const sign = value < 0 ? "-" : "";
        const abs = Math.abs(value);
        const scale = 10 ** places;
        return `${sign}${Math.floor(abs / scale)}.${String(abs % scale).padStart(places, "0")}`;
    };
    const plain = (text: string) => text.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    for (let k = -20_000; k <= 20_000; k++) {
        const units = 10 * k + (k < 0 ? -5 : 5); // đơn vị 1e-5, đúng một nửa bước 1e-4
        const steps = k < 0 ? k - 1 : k + 1; // hoà thì ra xa số 0
        const input = format(units, 5);
        const expected = plain(format(steps, 4)).replace(/^-0$/, "0");
        for (const driver of drivers) {
            const got = driver.of(input).round().toString();
            if (got !== expected) {
                throw new Error(`${driver.name}: round(${input}) = ${got}, expected ${expected}`);
            }
        }
    }
});

/** PRNG có seed cố định (xorshift32) để fuzz lặp lại được. */
const rng = (seed: number) => {
    let state = seed >>> 0 || 1;
    return () => {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 2 ** 32;
    };
};

test("calc: fuzz 200 000 chuỗi phép tính — hai driver bằng nhau tuyệt đối", async () => {
    const random = rng(20_261_026);
    /** Toán hạng thập phân 0–10 chữ số (nhiều hơn lưới 1e-8 để thử chuẩn hoá), |x| ≤ maxAbs, dưới dạng chuỗi chính xác. */
    const operand = (maxAbs: number, maxPlaces = 10) => {
        const places = Math.floor(random() * (maxPlaces + 1));
        const scale = 10 ** places;
        const value = Math.round((random() * 2 - 1) * maxAbs * scale);
        const sign = value < 0 ? "-" : "";
        const abs = Math.abs(value);
        return places === 0
            ? `${sign}${abs}`
            : `${sign}${Math.floor(abs / scale)}.${String(abs % scale).padStart(places, "0")}`;
    };

    for (let iteration = 0; iteration < 200_000; iteration++) {
        const start = operand(100_000);
        let values: CalcValue[] = drivers.map((driver) => driver.of(start));
        const trail = [start];
        const steps = 1 + Math.floor(random() * 8);
        for (let step = 0; step < steps; step++) {
            const kind = Math.floor(random() * 6);
            let apply: (value: CalcValue) => CalcValue;
            let label: string;
            if (kind === 0 || kind === 1) {
                const next = operand(10_000);
                apply = kind === 0 ? (v) => v.plus(next) : (v) => v.minus(next);
                label = `${kind === 0 ? "+" : "-"}${next}`;
            } else if (kind === 2) {
                const next = operand(100);
                apply = (v) => v.times(next);
                label = `*${next}`;
            } else if (kind === 3) {
                const next = operand(1_000);
                if (Number(next) === 0) continue;
                apply = (v) => v.div(next);
                label = `/${next}`;
            } else if (kind === 4) {
                const exponent = Math.floor(random() * 4);
                apply = (v) => v.pow(exponent);
                label = `^${exponent}`;
            } else {
                apply = (v) => v.round();
                label = "round";
            }
            // Đo bằng big trước: chỉ áp lên native khi kết quả nằm trong ngưỡng an toàn của nó.
            const exact = apply(values[1]);
            if (exact.abs().gt(5_000_000)) continue;
            values = [apply(values[0]), exact];
            trail.push(label);
        }
        const [a, b] = values.map(observe);
        if (JSON.stringify(a) !== JSON.stringify(b)) {
            throw new Error(
                `iteration ${iteration} (${trail.join(" ")}): native ${JSON.stringify(a)} vs big ${JSON.stringify(b)}`
            );
        }
        const probe = operand(1_000);
        for (const op of ["lt", "lte", "gt", "gte", "eq"] as const) {
            const [x, y] = values.map((value) => value[op](probe));
            if (x !== y) {
                throw new Error(
                    `iteration ${iteration} (${trail.join(" ")}): ${op}(${probe}) differs`
                );
            }
        }
    }
});

test("calc: đầu vào nhiều hơn 8 chữ số được chuẩn hoá giống nhau (kể cả ô hoà ở chữ số thứ 9)", async () => {
    checkEqual(
        same("tie at 9th place", (d) => [
            d.of(0.123456785).toString(),
            d.of("0.123456785").toString(),
            d.of("-0.123456785").toString(),
            d.of("0.0000000049").toString(),
            d.of("0.000000005").toString(),
            d.of(0.0001).times(0.00005).toString(),
            d.of(1e-7).toString(),
            d.of(5e-9).toString(),
        ]),
        [
            "0.12345679",
            "0.12345679",
            "-0.12345679",
            "0",
            "0.00000001",
            "0.00000001",
            "0.0000001",
            "0.00000001",
        ],
        "inputs and products snap to the 1e-8 lattice half-up"
    );
});

test("calc: đổi driver giữa chừng bằng use() — giá trị cũ vẫn dùng được", async () => {
    try {
        calcService.use(native);
        const fromNative = calcService.of("0.1").plus(0.2);
        calcService.use("big");
        checkEqual(calcService.name, "big", "switched to big");
        checkEqual(
            calcService.of(100).plus(fromNative).toString(),
            "100.3",
            "native value used by the big driver"
        );
        const fromBig = calcService.of("1.1").times(100);
        calcService.use("native");
        checkEqual(calcService.name, "native", "switched back to native");
        checkEqual(calcService.of(1).plus(fromBig).toString(), "111", "big value used by native");
        checkEqual(fromBig.ceil(), 110, "a value keeps working with its own driver");
        for (let round = 0; round < 3; round++) {
            calcService.use(round % 2 === 0 ? "big" : "native");
            checkEqual(calcService.of(100).times(1.1).ceil(), 110, `round ${round}`);
        }
        check(
            throwsOf(() => calcService.use("nope" as "native")) instanceof CalcInputError,
            "unknown driver name throws"
        );
        const pinned = new CalcService("big");
        calcService.use("native");
        checkEqual(pinned.name, "big", "an own instance is unaffected by calcService.use");
        checkEqual(calcService.name, "native", "the shared instance follows calcService.use");
    } finally {
        calcService.use(native);
    }
});

test("calc: giá trị của driver này dùng được làm đầu vào của driver kia", async () => {
    const inputs: CalcInput[] = [1, "2.5", native.of(3), big.of(4)];
    for (const driver of drivers) {
        checkEqual(
            driver.sum(inputs).toString(),
            "10.5",
            `${driver.name}: sum of mixed inputs from both drivers`
        );
    }
});
