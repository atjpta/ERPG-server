import type { ErrorCode } from "@/core/types/result.type.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { EndpointContext, EndpointOptions } from "colyseus";
import { APIError } from "@colyseus/better-call";
import { ZodError } from "zod";
import type { ErrorData, Failure, Result } from "@/core/types/result.type.js";
import { fail, ok } from "@/core/utils/result.util.js";

/** Tham số của `Response.*`: `data` chỉ cho thành công, `code` / `error` chỉ cho thất bại. */
export interface ResRaw {
    data?: unknown;
    message?: string;
    code?: ErrorCode;
    error?: ErrorData;
}

export enum HttpStatusCode {
    // 2xx
    OK = 200,
    CREATED = 201,
    ACCEPTED = 202,
    NO_CONTENT = 204,

    // 3xx
    MOVED_PERMANENTLY = 301,
    FOUND = 302,
    NOT_MODIFIED = 304,

    // 4xx
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    METHOD_NOT_ALLOWED = 405,
    CONFLICT = 409,
    GONE = 410,
    UNPROCESSABLE_ENTITY = 422,
    TOO_MANY_REQUESTS = 429,

    // 5xx
    INTERNAL_SERVER_ERROR = 500,
    BAD_GATEWAY = 502,
    SERVICE_UNAVAILABLE = 503,
    GATEWAY_TIMEOUT = 504,
}

export type Ctx = EndpointContext<string, EndpointOptions>;

const serialize = (data: unknown): unknown =>
    data != null ? JSON.parse(JSON.stringify(data)) : null;

/** Mã mặc định theo HTTP status khi lỗi không chỉ định `code`. */
const DEFAULT_CODE: Record<number, ErrorCode> = {
    [HttpStatusCode.BAD_REQUEST]: CommonCode.BAD_REQUEST,
    [HttpStatusCode.UNAUTHORIZED]: CommonCode.UNAUTHORIZED,
    [HttpStatusCode.FORBIDDEN]: CommonCode.FORBIDDEN,
    [HttpStatusCode.NOT_FOUND]: CommonCode.NOT_FOUND,
    [HttpStatusCode.CONFLICT]: CommonCode.CONFLICT,
    [HttpStatusCode.UNPROCESSABLE_ENTITY]: CommonCode.INVALID_INPUT,
    [HttpStatusCode.TOO_MANY_REQUESTS]: CommonCode.TOO_MANY_REQUESTS,
};

const failure = (status: number, res: ResRaw, fallbackMessage: string): Failure =>
    fail(
        res.code ?? DEFAULT_CODE[status] ?? CommonCode.INTERNAL_ERROR,
        res.message ?? fallbackMessage,
        res.error ?? null
    );

export const Response = {
    ok(res: ResRaw = {}): Result<unknown> {
        return ok(serialize(res.data), res.message);
    },

    created(ctx: Ctx, res: ResRaw = {}): Result<unknown> {
        ctx.setStatus(HttpStatusCode.CREATED);
        return ok(serialize(res.data), res.message ?? "Created");
    },

    noContent(ctx: Ctx, res: ResRaw = {}): Result<unknown> {
        ctx.setStatus(HttpStatusCode.NO_CONTENT);
        return ok(null, res.message ?? "No content");
    },

    badRequest(ctx: Ctx, res: ResRaw = {}): never {
        throw ctx.error(HttpStatusCode.BAD_REQUEST, failure(400, res, "Bad request"));
    },

    unauthorized(ctx: Ctx, res: ResRaw = {}): never {
        throw ctx.error(HttpStatusCode.UNAUTHORIZED, failure(401, res, "Unauthorized"));
    },

    forbidden(ctx: Ctx, res: ResRaw = {}): never {
        throw ctx.error(HttpStatusCode.FORBIDDEN, failure(403, res, "Forbidden"));
    },

    notFound(ctx: Ctx, res: ResRaw = {}): never {
        throw ctx.error(HttpStatusCode.NOT_FOUND, failure(404, res, "Not found"));
    },

    conflict(ctx: Ctx, res: ResRaw = {}): never {
        throw ctx.error(HttpStatusCode.CONFLICT, failure(409, res, "Conflict"));
    },

    unprocessable(ctx: Ctx, res: ResRaw = {}): never {
        throw ctx.error(
            HttpStatusCode.UNPROCESSABLE_ENTITY,
            failure(422, res, "Unprocessable entity")
        );
    },

    tooManyRequests(ctx: Ctx, res: ResRaw & { retryAfterSeconds?: number } = {}): never {
        const { retryAfterSeconds, ...rest } = res;
        throw ctx.error(
            HttpStatusCode.TOO_MANY_REQUESTS,
            failure(
                429,
                {
                    ...rest,
                    error: rest.error ?? (retryAfterSeconds ? { retryAfterSeconds } : undefined),
                },
                "Too many requests"
            ),
            retryAfterSeconds ? { "retry-after": String(retryAfterSeconds) } : undefined
        );
    },

    internalError(ctx: Ctx, res: ResRaw = {}): never {
        throw ctx.error(
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            failure(500, res, "Internal server error")
        );
    },
};

export const RouterContainer = async (
    ctx: Ctx,
    fn: () => Promise<Result<unknown>>
): Promise<Result<unknown>> => {
    try {
        return await fn();
    } catch (e) {
        if (e instanceof APIError) throw e;
        if (e instanceof ZodError) {
            return Response.unprocessable(ctx, {
                message: "Validation failed",
                code: CommonCode.INVALID_INPUT,
                error: { issues: e.issues.map(({ path, message }) => ({ path, message })) },
            });
        }
        const err = e as { statusCode?: number; message?: string; code?: ErrorCode };
        if (err?.statusCode) {
            throw ctx.error(
                err.statusCode as Parameters<Ctx["error"]>[0],
                failure(err.statusCode, { message: err.message, code: err.code }, "Error")
            );
        }
        console.error("[API] Unhandled endpoint error:", (e as Error)?.stack ?? err?.message ?? e);
        return Response.internalError(ctx);
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
    return globalThis.Response.json(fail(code, body?.message ?? error.message), {
        status,
        headers: error.headers as HeadersInit,
    });
};
