import { ResponseCode } from "@/core/enums/response-code.enum.js";

export function serviceError(message: string, statusCode: number, code: ResponseCode): never {
    throw Object.assign(new Error(message), { statusCode, code });
}
