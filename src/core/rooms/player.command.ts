import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import type { ErrorData, Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import { Command } from "@colyseus/command";
import type { Room } from "colyseus";
import type { z } from "zod";

/** Payload tối thiểu của message từ client: kết nối đã xác thực (`client.auth.playerId`). */
export interface PlayerCommandPayload {
    client: PlayerClient;
}

/**
 * Guard chạy trước `execute()` của command (rate limit, quyền, trạng thái...). Trả `Result` thất bại hoặc
 * ném `serviceError` để từ chối; trả `undefined` để cho qua.
 */
export type CommandGuard<TCommand = unknown> = (
    command: TCommand
) => Result<unknown> | undefined | void | Promise<Result<unknown> | undefined | void>;

/**
 * Base cho command do một player trong room gửi lên (dùng chung mọi room), theo mô hình Request/Response:
 * client gọi `room.Request<T>(message, payload)`, handler trả `this.result` (envelope `Result`).
 *
 * Thứ tự: `findPlayer()` → parse `validateSchema` vào `this.body` → `validate()` của command con →
 * `guards` → `execute()`. Bước nào từ chối thì `result` là `Result` thất bại và các bước sau không chạy:
 * player không còn trong room = `NOT_FOUND`, payload sai = `INVALID_INPUT` (kèm `invalidError`).
 * Lỗi ném ra từ `execute()` (kể cả `serviceError`) được đổi thành `Result` bằng `Response.fromError`.
 *
 * Command thành công gán `this.result = ok(data)`; không gán thì request nhận `ok()` rỗng. Command chỉ đẩy
 * thông báo (không cần trả lời) vẫn dùng như cũ qua `client.send*`.
 */
export abstract class PlayerCommand<
    TRoom extends Room,
    TPlayer,
    TPayload extends PlayerCommandPayload = PlayerCommandPayload,
    TSchema extends z.ZodType = z.ZodUndefined,
> extends Command<TRoom, TPayload> {
    protected player!: TPlayer;
    /** Data client gửi lên sau khi đã validate (validateSchema). */
    protected body!: z.infer<TSchema>;
    /** Zod schema của payload; bỏ trống nếu message không có payload. */
    protected readonly validateSchema?: TSchema;
    /** `error` kèm theo khi trả `INVALID_INPUT`. */
    protected readonly invalidError: ErrorData | null = null;
    /** Guard chạy theo thứ tự trước `execute()`. */
    protected readonly guards: readonly CommandGuard<this>[] = [];

    /** Kết quả trả cho client (response của request). `undefined` = chưa có / không cần trả lời. */
    result?: Result<unknown>;

    /** Tìm player của `client` trong room; `undefined` = không có (request nhận `NOT_FOUND`). */
    protected abstract findPlayer(room: TRoom, playerId: string): TPlayer | undefined;

    constructor() {
        super();
        // Phần chung chạy quanh `validate()` / `execute()` của command con (dispatcher chỉ gọi hai hàm này).
        const ownValidate = this.validate;
        this.validate = (payload: TPayload) =>
            this.prepare(payload) && ownValidate.call(this, payload);

        const ownExecute = this.execute;
        this.execute = async (payload: TPayload) => {
            try {
                for (const guard of this.guards) {
                    const denied = await guard(this);
                    if (denied && !denied.success) {
                        this.result = denied;
                        return;
                    }
                }
                return await ownExecute.call(this, payload);
            } catch (error) {
                this.result = Response.fromError(error);
            }
        };
    }

    validate(_payload: TPayload): boolean {
        return true;
    }

    private prepare({ client, payload }: TPayload & { payload?: unknown }): boolean {
        const player = this.findPlayer(this.room, client.auth.playerId);
        if (player === undefined) {
            this.result = Response.error(CommonCode.NOT_FOUND, "Player is not in this room");
            return false;
        }
        this.player = player;
        if (!this.validateSchema) return true;

        const parsed = this.validateSchema.safeParse(payload);
        if (!parsed.success) {
            this.result = Response.error(
                CommonCode.INVALID_INPUT,
                undefined,
                this.invalidError ?? {
                    issues: parsed.error.issues.map((issue) => ({
                        path: issue.path.join("."),
                        message: issue.message,
                    })),
                }
            );
            return false;
        }
        this.body = parsed.data;
        return true;
    }
}
