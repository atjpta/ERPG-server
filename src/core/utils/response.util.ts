import { EndpointContext, EndpointOptions } from "colyseus";
import { APIError } from "@colyseus/better-call";
import { ZodError } from "zod";

interface Res {
    data: any;
    message: string;
    error: any;
    code: string | null;
}

export interface ResRaw {
    data?: any;
    message?: string;
    error?: any;
    code?: string | null;
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

const serialize = (data: any): any => (data != null ? JSON.parse(JSON.stringify(data)) : null);

export const Response = {
    ok(res: ResRaw = {}): Res {
        return {
            data: serialize(res.data ?? null),
            message: res.message ?? "✅ Success",
            error: null,
            code: res.code ?? null,
        };
    },

    created(ctx: Ctx, res: ResRaw = {}): Res {
        ctx.setStatus(HttpStatusCode.CREATED);
        return {
            data: serialize(res.data ?? null),
            message: res.message ?? "🎉 Created successfully",
            error: null,
            code: res.code ?? null,
        };
    },

    noContent(ctx: Ctx, res: ResRaw = {}): Res {
        ctx.setStatus(HttpStatusCode.NO_CONTENT);
        return {
            data: null,
            message: res.message ?? "🗑️ No content",
            error: null,
            code: res.code ?? null,
        };
    },

    badRequest(ctx: Ctx, res: ResRaw = {}): Res {
        throw ctx.error(HttpStatusCode.BAD_REQUEST, {
            data: null,
            message: res.message ?? "❌ Bad request",
            error: res.error ?? res.message,
            code: res.code ?? null,
        });
    },

    unauthorized(ctx: Ctx, res: ResRaw = {}): Res {
        throw ctx.error(HttpStatusCode.UNAUTHORIZED, {
            data: null,
            message: res.message ?? "🔒 Unauthorized",
            error: res.error ?? res.message,
            code: res.code ?? null,
        });
    },

    forbidden(ctx: Ctx, res: ResRaw = {}): Res {
        throw ctx.error(HttpStatusCode.FORBIDDEN, {
            data: null,
            message: res.message ?? "⛔ Forbidden",
            error: res.error ?? res.message,
            code: res.code ?? null,
        });
    },

    notFound(ctx: Ctx, res: ResRaw = {}): Res {
        throw ctx.error(HttpStatusCode.NOT_FOUND, {
            data: null,
            message: res.message ?? "🔍 Not found",
            error: res.error ?? res.message,
            code: res.code ?? null,
        });
    },

    conflict(ctx: Ctx, res: ResRaw = {}): Res {
        throw ctx.error(HttpStatusCode.CONFLICT, {
            data: null,
            message: res.message ?? "⚡ Conflict",
            error: res.error ?? res.message,
            code: res.code ?? null,
        });
    },

    unprocessable(ctx: Ctx, res: ResRaw = {}): Res {
        throw ctx.error(HttpStatusCode.UNPROCESSABLE_ENTITY, {
            data: null,
            message: res.message ?? "⚠️ Unprocessable entity",
            error: res.error ?? res.message,
            code: res.code ?? null,
        });
    },

    tooManyRequests(ctx: Ctx, res: ResRaw & { retryAfterSeconds?: number } = {}): Res {
        throw ctx.error(
            HttpStatusCode.TOO_MANY_REQUESTS,
            {
                data: null,
                message: res.message ?? "🐢 Too many requests",
                error: res.error ?? res.message,
                code: res.code ?? null,
            },
            res.retryAfterSeconds ? { "retry-after": String(res.retryAfterSeconds) } : undefined
        );
    },

    internalError(ctx: Ctx, res: ResRaw = {}): Res {
        throw ctx.error(HttpStatusCode.INTERNAL_SERVER_ERROR, {
            data: null,
            message: res.message ?? "💥 Internal server error",
            error: res.error ?? res.message,
            code: res.code ?? null,
        });
    },
};

export const RouterContainer = async (ctx: Ctx, fn: () => Promise<Res>): Promise<Res> => {
    try {
        return await fn();
    } catch (e) {
        if (e instanceof APIError) throw e;
        if (e instanceof ZodError) return Response.unprocessable(ctx, { error: e._zod.def });
        const err = e as any;
        if (err?.statusCode) {
            throw ctx.error(err.statusCode, {
                data: null,
                message: err.message ?? "Error",
                error: err.message ?? "Error",
                code: err.code ?? null,
            });
        }
        console.error("[API] Unhandled endpoint error:", err?.stack ?? err?.message ?? e);
        return Response.internalError(ctx, { error: err?.message ?? e });
    }
};
