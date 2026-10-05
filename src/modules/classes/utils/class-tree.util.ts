/**
 * Code của class và mọi class gốc của nó (dựng ngược từ `nextClassCodes`): Swordman → Knight thì
 * `knight` có tổ tiên `swordman`. Dùng để class đã chuyển vẫn mặc được đồ của class gốc.
 */
export function buildClassLineages(
    classes: readonly { code: string; nextClassCodes: readonly string[] }[]
): Map<string, Set<string>> {
    const parents = new Map<string, string[]>();
    for (const { code, nextClassCodes } of classes) {
        for (const next of nextClassCodes) parents.set(next, [...(parents.get(next) ?? []), code]);
    }
    const lineages = new Map<string, Set<string>>();
    for (const { code } of classes) {
        const lineage = new Set<string>();
        const stack = [code];
        while (stack.length > 0) {
            const current = stack.pop()!;
            if (lineage.has(current)) continue; // chặn vòng lặp nếu cấu hình sai
            lineage.add(current);
            stack.push(...(parents.get(current) ?? []));
        }
        lineages.set(code, lineage);
    }
    return lineages;
}
