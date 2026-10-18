import type { ErrorCode } from "@/core/types/result.type.js";

export function serviceError(message: string, statusCode: number, code: ErrorCode): never {
    throw Object.assign(new Error(message), { statusCode, code });
}
