import { ZodError } from "zod";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { toEnvelope } from "@/core/response/envelope.js";
import { HttpResponse, HttpStatusCode, type Ctx } from "@/core/response/http-response.js";
import { Response } from "@/core/response/response.js";
import { RoomResponse } from "@/core/response/room-response.js";
import { check, checkEqual, test } from "./harness.js";

/** `ctx` giả: ghi lại status và ném `{ status, body, headers }` như `ctx.error`. */
const fakeCtx = () => {
    const state: { status?: number } = {};
    const ctx = {
        setStatus: (status: number) => (state.status = status),
        error: (status: number, body: unknown, headers?: Record<string, string>) => ({
            status,
            body,
            headers,
        }),
    } as unknown as Ctx;
    return { ctx, state };
};

const thrownBy = (fn: () => unknown) => {
    try {
        fn();
    } catch (error) {
        return error as { status: number; body: { code: string }; headers?: unknown };
    }
    return undefined;
};

const caught = (fn: () => unknown): unknown => {
    try {
        fn();
    } catch (error) {
        return error;
    }
    return undefined;
};

test("response: success / error / isError / map", async () => {
    checkEqual(Response.success(), { success: true, data: null }, "empty success");
    checkEqual(Response.success(5), { success: true, data: 5 }, "success with data");
    checkEqual(Response.error("X"), { success: false, errorCode: "X" }, "error without data");
    checkEqual(
        Response.error("X", { max: 3 }),
        { success: false, errorCode: "X", errorData: { max: 3 } },
        "error with data"
    );
    check(Response.isError(Response.error("X")) && !Response.isError(Response.success()), "guard");
    checkEqual(
        Response.map(Response.success(2), (n) => n * 2),
        Response.success(4),
        "map ok"
    );
    checkEqual(
        Response.map(Response.error("X"), () => 1),
        Response.error("X"),
        "map keeps error"
    );
    const roundTrip = JSON.parse(JSON.stringify(Response.error("X", { a: 1 })));
    checkEqual(roundTrip, Response.error("X", { a: 1 }), "plain JSON survives remoteRoomCall");
});

test("response: abort + attempt, fromThrown", async () => {
    const aborted = await Response.attempt(async () => Response.abort("NOPE", { why: 1 }));
    checkEqual(aborted, Response.error("NOPE", { why: 1 }), "abort becomes error");
    checkEqual(await Response.attempt(async () => 7), Response.success(7), "attempt ok");
    let rethrown = false;
    await Response.attempt(async () => {
        throw new Error("boom");
    }).catch(() => (rethrown = true));
    check(rethrown, "unknown errors are rethrown by attempt");

    checkEqual(
        Response.fromThrown(caught(() => Response.abort(CommonCode.NOT_FOUND))),
        Response.error(CommonCode.NOT_FOUND),
        "abort keeps the code"
    );
    const zod = Response.fromThrown(
        new ZodError([{ code: "custom", path: ["a"], message: "bad" }])
    );
    checkEqual(zod.errorCode, CommonCode.INVALID_INPUT, "zod -> INVALID_INPUT");
    checkEqual(
        (zod.errorData as { issues: unknown[] }).issues,
        [{ path: ["a"], message: "bad" }],
        "zod issues"
    );
    const originalError = console.error;
    console.error = () => undefined;
    try {
        checkEqual(
            Response.fromThrown(new Error("secret")),
            Response.error(CommonCode.INTERNAL_ERROR),
            "unknown -> INTERNAL_ERROR without details"
        );
    } finally {
        console.error = originalError;
    }
});

test("response: envelope giống nhau cho API và room", async () => {
    checkEqual(
        toEnvelope(Response.success({ a: 1 })),
        { success: true, data: { a: 1 }, code: null, message: "OK", error: null },
        "success envelope"
    );
    checkEqual(
        toEnvelope(Response.error("ITEM_NOT_FOUND", { id: "x" })),
        {
            success: false,
            data: null,
            code: "ITEM_NOT_FOUND",
            message: "Item not found",
            error: { id: "x" },
        },
        "failure envelope"
    );
    const { ctx } = fakeCtx();
    checkEqual(
        HttpResponse.from(ctx, Response.success({ a: 1 })),
        RoomResponse.reply(Response.success({ a: 1 })),
        "same success envelope from HttpResponse and RoomResponse"
    );
    checkEqual(
        RoomResponse.reply(),
        toEnvelope(Response.success()),
        "reply default is empty success"
    );
});

test("response: HttpResponse.from đặt status theo mã lỗi", async () => {
    const ok = fakeCtx();
    HttpResponse.from(ok.ctx, Response.success(1), HttpStatusCode.CREATED);
    checkEqual(ok.state.status, 201, "created");

    const notFound = thrownBy(() =>
        HttpResponse.from(fakeCtx().ctx, Response.error(CommonCode.NOT_FOUND))
    );
    checkEqual(notFound?.status, 404, "registered status");
    checkEqual(notFound?.body.code, CommonCode.NOT_FOUND, "envelope code");
    const unknown = thrownBy(() =>
        HttpResponse.from(fakeCtx().ctx, Response.error("UNREGISTERED"))
    );
    checkEqual(unknown?.status, 400, "default status 400");
    const unavailable = thrownBy(() =>
        HttpResponse.from(fakeCtx().ctx, Response.error(CommonCode.ROOM_UNAVAILABLE))
    );
    checkEqual(unavailable?.status, 503, "room unavailable -> 503");
    const limited = thrownBy(() => HttpResponse.tooManyRequests(fakeCtx().ctx, 30));
    checkEqual(limited?.status, 429, "too many requests");
    checkEqual(limited?.headers, { "retry-after": "30" }, "retry-after header");
});

test("response: RoomResponse.send / sendError / broadcast", async () => {
    const sent: unknown[][] = [];
    const client = { send: (...args: unknown[]) => sent.push(args) } as never;
    RoomResponse.send(client, "wallet", { gold: 1 });
    RoomResponse.send(client, "ping");
    RoomResponse.sendError(client, "denied", "DUNGEON_DENIED", { n: 2 });
    checkEqual(sent[0], ["wallet", toEnvelope(Response.success({ gold: 1 }))], "send");
    checkEqual(sent[1], ["ping", toEnvelope(Response.success())], "send without data");
    checkEqual(
        sent[2],
        ["denied", toEnvelope(Response.error("DUNGEON_DENIED", { n: 2 }))],
        "sendError"
    );
    const broadcasts: unknown[][] = [];
    const room = { broadcast: (...args: unknown[]) => broadcasts.push(args) } as never;
    RoomResponse.broadcast(room, "chat", { text: "hi" }, { except: undefined });
    checkEqual(
        broadcasts[0],
        ["chat", toEnvelope(Response.success({ text: "hi" })), { except: undefined }],
        "broadcast"
    );
});
