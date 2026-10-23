/** Phần của class cần để dựng cây chuyển cấp. */
export interface ClassTreeNode {
    code: string;
    tier: number;
    /** Class con trực thuộc (các hướng chuyển cấp lên). */
    nextClassCodes: readonly string[];
}
