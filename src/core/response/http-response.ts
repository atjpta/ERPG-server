import { APIError } from "@colyseus/better-call";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { HttpStatusCode } from "@/core/enums/http-status-code.enum.js";
import { errorStatus } from "@/core/response/error-code.js";
import { errorEnvelope, successEnvelope, toEnvelope } from "@/core/response/envelope.js";
import { Response } from "@/core/response/response.js";
import type { Response as ResponseOf } from "@/core/response/response.type.js";
import type {
    ErrorCode,
    ErrorData,
    Pagination,
    Paginated,
    Result,
} from "@/core/response/result.type.js";
import type { EndpointContext, EndpointOptions } from "colyseus";

export type Ctx = EndpointContext<string, EndpointOptions>;

type ErrorStatus = Parameters<Ctx["error"]>[0];
type SuccessStatus = Parameters<Ctx["setStatus"]>[0];

const serialize = (data: unknown): unknown =>
    data != null ? JSON.parse(JSON.stringify(data)) : null;

/** Mã mặc định theo HTTP status khi lỗi không chỉ định mã cụ thể. */
const DEFAULT_CODE: Record<number, ErrorCode> = {
    [HttpStatusCode.BAD_REQUEST]: CommonCode.BAD_REQUEST,
    [HttpStatusCode.UNAUTHORIZED]: CommonCode.UNAUTHORIZED,
    [HttpStatusCode.FORBIDDEN]: CommonCode.FORBIDDEN,
    [HttpStatusCode.NOT_FOUND]: CommonCode.NOT_FOUND,
    [HttpStatusCode.CONFLICT]: CommonCode.CONFLICT,
    [HttpStatusCode.UNPROCESSABLE_ENTITY]: CommonCode.INVALID_INPUT,
    [HttpStatusCode.TOO_MANY_REQUESTS]: CommonCode.TOO_MANY_REQUESTS,
};

/** Ném envelope lỗi với `status` (kèm header nếu có). */
const error = (
    ctx: Ctx,
    status: number,
    code: ErrorCode | undefined,
    errorData?: ErrorData,
    headers?: Record<string, string>
): never => {
    throw ctx.error(
        status as ErrorStatus,
        errorEnvelope(code ?? DEFAULT_CODE[status] ?? CommonCode.INTERNAL_ERROR, errorData),
        headers
    );
};

/**
 * Lớp trả lời của API: đổi `Response` nội bộ thành envelope `Result` + HTTP status. Controller chỉ có một khuôn:
 * `return HttpResponse.from(ctx, await service.x())` (hoặc `HttpResponse.success(data)` khi dữ liệu có sẵn).
 */
export const HttpResponse = {
    /**
     * Thành công → envelope 200 (hoặc `status` nếu truyền, vd `CREATED`); thất bại → ném envelope lỗi với HTTP status
     * đăng ký cho mã lỗi đó (`registerErrorCodes`, mặc định 400).
     */
    from<T>(ctx: Ctx, response: ResponseOf<T>, status?: HttpStatusCode): Result<unknown> {
        if (Response.isError(response)) {
            return error(
                ctx,
                errorStatus(response.errorCode),
                response.errorCode,
                response.errorData
            );
        }
        if (status) ctx.setStatus(status as SuccessStatus);
        return toEnvelope(Response.success(serialize(response.data)));
    },

    /** Thành công với dữ liệu có sẵn. */
    success(data?: unknown): Result<unknown> {
        return successEnvelope(serialize(data));
    },

    /** Thành công, HTTP 201. */
    created(ctx: Ctx, data?: unknown): Result<unknown> {
        ctx.setStatus(HttpStatusCode.CREATED as SuccessStatus);
        return successEnvelope(serialize(data), "Created");
    },

    /** Thành công với danh sách: luôn là `{ items, pagination }`. */
    page<T>(items: T[], pagination: Pagination): Result<Paginated<T>> {
        return successEnvelope({ items, pagination });
    },

    badRequest(ctx: Ctx, code?: ErrorCode, errorData?: ErrorData): never {
        return error(ctx, HttpStatusCode.BAD_REQUEST, code, errorData);
    },

    unauthorized(ctx: Ctx, code?: ErrorCode, errorData?: ErrorData): never {
        return error(ctx, HttpStatusCode.UNAUTHORIZED, code, errorData);
    },

    forbidden(ctx: Ctx, code?: ErrorCode, errorData?: ErrorData): never {
        return error(ctx, HttpStatusCode.FORBIDDEN, code, errorData);
    },

    notFound(ctx: Ctx, code?: ErrorCode, errorData?: ErrorData): never {
        return error(ctx, HttpStatusCode.NOT_FOUND, code, errorData);
    },

    conflict(ctx: Ctx, code?: ErrorCode, errorData?: ErrorData): never {
        return error(ctx, HttpStatusCode.CONFLICT, code, errorData);
    },

    unprocessable(ctx: Ctx, code?: ErrorCode, errorData?: ErrorData): never {
        return error(ctx, HttpStatusCode.UNPROCESSABLE_ENTITY, code, errorData);
    },

    tooManyRequests(ctx: Ctx, retryAfterSeconds?: number): never {
        return error(
            ctx,
            HttpStatusCode.TOO_MANY_REQUESTS,
            CommonCode.TOO_MANY_REQUESTS,
            retryAfterSeconds ? { retryAfterSeconds } : undefined,
            retryAfterSeconds ? { "retry-after": String(retryAfterSeconds) } : undefined
        );
    },

    internalError(ctx: Ctx): never {
        return error(ctx, HttpStatusCode.INTERNAL_SERVER_ERROR, CommonCode.INTERNAL_ERROR);
    },
};

/** Bọc thân endpoint: lỗi ném ra (`Response.abort`, Zod, lỗi lạ) thành envelope lỗi + HTTP status. */
export const RouterContainer = async (
    ctx: Ctx,
    fn: () => Promise<Result<unknown>>
): Promise<Result<unknown>> => {
    try {
        return await fn();
    } catch (e) {
        if (e instanceof APIError) throw e;
        const thrown = Response.fromThrown(e);
        return error(ctx, errorStatus(thrown.errorCode), thrown.errorCode, thrown.errorData);
    }
};

/**
 * `onError` của router: lỗi do framework ném (validate body / query / params) không đi qua `RouterContainer`
 * nên đổi sang envelope chung. Lỗi đã là envelope thì giữ nguyên.
 */
export const routerErrorHandler = (error: unknown): globalThis.Response | undefined => {
    if (!(error instanceof APIError)) return undefined;
    const body = error.body as { success?: boolean; message?: string; code?: string } | undefined;
    if (body && "success" in body) return undefined;
    const status = error.statusCode;
    const code =
        body?.code === "VALIDATION_ERROR"
            ? CommonCode.INVALID_INPUT
            : (DEFAULT_CODE[status] ?? CommonCode.INTERNAL_ERROR);
    return globalThis.Response.json(errorEnvelope(code, null, body?.message ?? error.message), {
        status,
        headers: error.headers as HeadersInit,
    });
};

export { HttpStatusCode };
