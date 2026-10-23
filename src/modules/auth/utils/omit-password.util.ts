/** Bỏ `password` trước khi trả về cho admin. */
export const omitPassword = <T extends { password?: string | null }>(user: T | null) => {
    if (!user) return null;
    const { password: _password, ...rest } = user;
    return rest;
};
