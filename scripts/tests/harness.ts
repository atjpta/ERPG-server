/**
 * Test harness tối giản cho các bài test tích hợp (chạy trên DB dev, không cần server đang chạy): `test(name, fn)` đăng ký,
 * `runAll()` chạy tuần tự rồi in kết quả và thoát với mã lỗi nếu có bài hỏng. Xem `scripts/tests/README.md`.
 */
export interface TestCase {
    name: string;
    run: () => Promise<void>;
}

const cases: TestCase[] = [];

export const test = (name: string, run: () => Promise<void>) => cases.push({ name, run });

export function check(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

export function checkEqual<T>(actual: T, expected: T, message: string) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
        );
    }
}

export async function runAll(filter?: string) {
    let failed = 0;
    for (const testCase of cases) {
        if (filter && !testCase.name.includes(filter)) continue;
        try {
            await testCase.run();
            console.info(`✅ ${testCase.name}`);
        } catch (error) {
            failed++;
            console.error(`❌ ${testCase.name}\n   ${(error as Error).message}`);
        }
    }
    console.info(failed === 0 ? "🎉 All tests passed" : `${failed} test(s) failed`);
    process.exit(failed === 0 ? 0 : 1);
}
