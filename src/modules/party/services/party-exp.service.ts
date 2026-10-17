/**
 * Chia exp cho `n` thành viên đủ điều kiện (cùng map, còn sống): tổng exp được cộng
 * `bonusPerExtraMember × (n − 1)` rồi chia đều, làm tròn xuống. n ≤ 1 hoặc exp ≤ 0: giữ nguyên.
 */
export const splitPartyExp = (
    exp: number,
    members: number,
    bonusPerExtraMember: number
): number => {
    if (members <= 1 || exp <= 0) return Math.max(0, Math.floor(exp));
    const pool = exp * (1 + bonusPerExtraMember * (members - 1));
    return Math.floor(pool / members);
};
