const registry = new Map<string, string>();

/**
 * Đăng ký một enum mã lỗi và kiểm tra: value phải bằng key, và không trùng value của enum khác
 * (mã lỗi là duy nhất toàn project dù được khai báo ở nhiều domain). Gọi ngay sau khai báo enum.
 */
export function registerErrorCodes(codes: Record<string, string>) {
    for (const [key, value] of Object.entries(codes)) {
        if (key !== value) throw new Error(`Error code ${key} must equal "${key}", got "${value}"`);
        if (registry.has(value)) throw new Error(`Duplicate error code "${value}"`);
        registry.set(value, key);
    }
}
