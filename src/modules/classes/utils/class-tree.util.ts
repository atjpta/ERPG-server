/** Phần của class cần để dựng cây chuyển cấp. */
export interface ClassTreeNode {
    code: string;
    tier: number;
    /** Class con trực thuộc (các hướng chuyển cấp lên). */
    nextClassCodes: readonly string[];
}

/**
 * Lỗi cấu hình cây chuyển cấp: class con không tồn tại, tier class con ≠ tier cha + 1. Cây cho phép
 * 1 class có nhiều cha và nhiều hướng chuyển cấp; tier tăng dần nên không thể có vòng lặp.
 */
export function validateClassTree(classes: readonly ClassTreeNode[]): string[] {
    const byCode = new Map(classes.map((node) => [node.code, node]));
    const errors: string[] = [];
    for (const parent of classes) {
        for (const childCode of parent.nextClassCodes) {
            const child = byCode.get(childCode);
            if (!child) {
                errors.push(`${parent.code} → ${childCode}: class not found or disabled`);
            } else if (child.tier !== parent.tier + 1) {
                errors.push(
                    `${parent.code} (tier ${parent.tier}) → ${childCode} (tier ${child.tier}): child tier must be parent tier + 1`
                );
            }
        }
    }
    return errors;
}

/**
 * Code class mà mỗi class được mặc đồ: chính nó + mọi class tier thấp hơn chuyển cấp được tới nó
 * (đi ngược `nextClassCodes`, gồm mọi nhánh khi có nhiều cha). Không gồm class tier cao hơn.
 */
export function buildUsableItemClassCodes(
    classes: readonly ClassTreeNode[]
): Map<string, Set<string>> {
    const parents = new Map<string, string[]>();
    for (const { code, nextClassCodes } of classes) {
        for (const next of nextClassCodes) parents.set(next, [...(parents.get(next) ?? []), code]);
    }
    const usable = new Map<string, Set<string>>();
    for (const { code } of classes) {
        const codes = new Set<string>();
        const stack = [code];
        while (stack.length > 0) {
            const current = stack.pop()!;
            if (codes.has(current)) continue;
            codes.add(current);
            stack.push(...(parents.get(current) ?? []));
        }
        usable.set(code, codes);
    }
    return usable;
}
