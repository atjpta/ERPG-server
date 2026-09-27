/** So sánh version dạng `major.minor.patch` (thiếu phần nào coi như 0). Trả -1 | 0 | 1. */
export function compareVersion(a: string, b: string): number {
    const pa = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
    const pb = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
}
