import type { ZodType } from "zod";

/*
 * Tài liệu cho client Unity khai báo ngay trên command / room. `yarn unity:network` đọc metadata này (ghép với
 * message, payload và kiểu data tự suy từ code) để sinh `*RoomClient.cs`. Decorator chỉ lưu metadata, không đổi
 * hành vi lúc chạy. Xem docs/client-sdk.md.
 */

const MESSAGE_META = Symbol.for("erpg.sdk.message");
const ROOM_META = Symbol.for("erpg.sdk.room");

export interface SdkMessageMeta {
    /** Message server → client (giá trị enum, vd `WorldMessage.INVENTORY`) mà command này trả lời. */
    replies?: readonly string[];
    /** Mã lỗi nghiệp vụ có thể xuất hiện trong các `replies` (mã chung như INVALID_INPUT cũng liệt kê khi có). */
    errors?: readonly string[];
    /** Ghi chú cho client (vd: payload sai thì server im lặng). */
    note?: string;
}

export interface SdkRoomJoin {
    /** Tên room đăng ký trên server (`world`, `dungeon`, `party`). */
    room: string;
    /** Zod schema options khi join; `null` = vào bằng `joinById`, không option. */
    options: ZodType | null;
    doc: string;
}

export interface SdkRoomMeta {
    joins: readonly SdkRoomJoin[];
}

type Constructor = abstract new (...args: never[]) => unknown;

/**
 * Gắn lên command client message: `@SdkMessage({ replies, errors, note })`. Command con thừa hưởng và gộp
 * metadata của lớp cha (vd lỗi chung của mọi thao tác túi đồ khai báo một lần ở lớp cha).
 */
export function SdkMessage(meta: SdkMessageMeta) {
    return <T extends Constructor>(target: T) => {
        Object.defineProperty(target, MESSAGE_META, { value: meta, configurable: true });
    };
}

/** Gắn lên class room: khai báo các cách join. */
export function SdkRoom(meta: SdkRoomMeta) {
    return <T extends Constructor>(target: T) => {
        Object.defineProperty(target, ROOM_META, { value: meta, configurable: true });
    };
}

/** Metadata của command đã gộp theo chuỗi kế thừa (lớp cha trước). */
export function readSdkMessage(command: unknown): Required<SdkMessageMeta> | undefined {
    const chain: SdkMessageMeta[] = [];
    for (
        let current = command as object | null;
        current && current !== Function.prototype;
        current = Object.getPrototypeOf(current)
    ) {
        if (Object.prototype.hasOwnProperty.call(current, MESSAGE_META)) {
            chain.unshift((current as Record<symbol, SdkMessageMeta>)[MESSAGE_META]);
        }
    }
    if (chain.length === 0) return undefined;
    return {
        replies: [...new Set(chain.flatMap((meta) => meta.replies ?? []))],
        errors: [...new Set(chain.flatMap((meta) => meta.errors ?? []))],
        note: chain
            .map((meta) => meta.note)
            .filter(Boolean)
            .join(" "),
    };
}

export function readSdkRoom(room: unknown): SdkRoomMeta | undefined {
    return Object.prototype.hasOwnProperty.call(room as object, ROOM_META)
        ? (room as Record<symbol, SdkRoomMeta>)[ROOM_META]
        : undefined;
}
