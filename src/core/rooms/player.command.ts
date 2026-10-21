import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import type { ErrorData } from "@/core/types/result.type.js";
import { Command } from "@colyseus/command";
import type { Room } from "colyseus";
import type { z } from "zod";

/** Payload tối thiểu của message từ client: kết nối đã xác thực (`client.auth.playerId`). */
export interface PlayerCommandPayload {
    client: PlayerClient;
}

/**
 * Base cho command do một player trong room gửi lên (dùng chung mọi room). Trước `validate()` của command
 * con luôn chạy phần chung:
 * 1. `findPlayer()` (room con định nghĩa) tìm `this.player` — không có thì dừng, im lặng;
 * 2. nếu có `validateSchema`: parse payload vào `this.body` — sai thì gửi `INVALID_INPUT` qua `replyType`
 *    (kèm `invalidError`), không khai báo `replyType` thì im lặng.
 * Command con chỉ viết `validate()` cho phần kiểm tra riêng (trạng thái, quyền...), gửi lỗi rồi trả `false`.
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
    /** Message trả `INVALID_INPUT` khi payload sai; bỏ trống = im lặng. */
    protected readonly replyType?: string | number;
    /** `error` kèm theo khi trả `INVALID_INPUT`. */
    protected readonly invalidError: ErrorData | null = null;

    /** Tìm player của `client` trong room; `undefined` = không có (command bị bỏ qua). */
    protected abstract findPlayer(room: TRoom, playerId: string): TPlayer | undefined;

    constructor() {
        super();
        // Phần chung chạy trước `validate()` của command con (dispatcher chỉ gọi `validate`).
        const own = this.validate;
        this.validate = (payload: TPayload) => this.prepare(payload) && own.call(this, payload);
    }

    validate(_payload: TPayload): boolean {
        return true;
    }

    private prepare({ client, payload }: TPayload & { payload?: unknown }): boolean {
        const player = this.findPlayer(this.room, client.auth.playerId);
        if (player === undefined) return false;
        this.player = player;
        if (!this.validateSchema) return true;

        if (this.replyType === undefined) {
            const parsed = this.validateSchema.safeParse(payload);
            if (!parsed.success) return false;
            this.body = parsed.data;
        } else {
            this.body = client.parsePayload(
                this.validateSchema,
                payload,
                this.replyType,
                this.invalidError
            );
        }
        return true;
    }
}
